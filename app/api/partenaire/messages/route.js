import { NextResponse } from "next/server";
import {
  resolvePartenaireSession,
  niveauActifPartenaire,
  compterMessagesMois,
  moisCourant,
} from "../../../lib/partenaires";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

function decodeImage(dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) return null;
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > MAX_BYTES) return null;
  const ext = m[1].split("/")[1].replace("jpeg", "jpg");
  return { contentType: m[1], buffer, ext };
}

// GET : les messages "nouveautés" du partenaire connecté + le contexte de
// quota (niveau de la période active, quota du mois, ce qu'il reste).
export async function GET(request) {
  const session = await resolvePartenaireSession(request);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });
  const { admin, partenaire } = session;

  const [{ data: messages }, { data: periodes }] = await Promise.all([
    admin.from("partenaire_messages").select("*").eq("partenaire_id", partenaire.id).order("created_at", { ascending: false }),
    admin.from("partenaire_periodes").select("*").eq("partenaire_id", partenaire.id),
  ]);

  const { niveau, config } = await niveauActifPartenaire(admin, periodes || []);
  const mois = moisCourant();
  const utilisesEmail = await compterMessagesMois(admin, partenaire.id, "email", mois);

  return NextResponse.json({
    ok: true,
    messages: messages || [],
    quota: {
      niveau,
      libelleNiveau: config?.libelle || null,
      moisCible: mois,
      quotaEmail: config?.quota_email ?? 0,
      utilisesEmail,
      restantEmail: Math.max(0, (config?.quota_email ?? 0) - utilisesEmail),
    },
  });
}

// POST : crée un message. `soumettre: true` le passe directement en 'soumis'
// (et vérifie le quota du mois) ; sinon il reste en 'brouillon'.
export async function POST(request) {
  const session = await resolvePartenaireSession(request);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });
  const { admin, partenaire } = session;

  const body = await request.json().catch(() => null);
  const type = body?.type === "reseau" ? "reseau" : "email";
  const titre = body?.titre?.trim();
  const texte = body?.texte?.trim();
  if (!titre || !texte) {
    return NextResponse.json({ error: "Titre et texte sont obligatoires." }, { status: 400 });
  }

  const moisCible = type === "email" ? (body?.moisCible?.trim() || moisCourant()) : null;
  const soumettre = body?.soumettre === true;

  if (soumettre) {
    const { data: periodes } = await admin
      .from("partenaire_periodes")
      .select("*")
      .eq("partenaire_id", partenaire.id);
    const { config } = await niveauActifPartenaire(admin, periodes || []);
    const quota = type === "reseau" ? config?.quota_reseau ?? 0 : config?.quota_email ?? 0;
    if (!config) {
      return NextResponse.json(
        { error: "Aucune période de partenariat active : impossible de soumettre un message." },
        { status: 403 }
      );
    }
    const utilises = await compterMessagesMois(admin, partenaire.id, type, moisCible);
    if (utilises >= quota) {
      return NextResponse.json(
        { error: `Quota atteint pour ${moisCible} (${quota} message${quota > 1 ? "s" : ""} / mois pour le niveau ${config.libelle}).` },
        { status: 409 }
      );
    }
  }

  let imageChemin = null;
  if (body?.imageDataUrl) {
    const img = decodeImage(body.imageDataUrl);
    if (!img) {
      return NextResponse.json({ error: "Image invalide ou trop lourde (10 Mo max)." }, { status: 400 });
    }
    imageChemin = `${partenaire.id}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${img.ext}`;
    const { error: upErr } = await admin.storage
      .from("partenaire-messages")
      .upload(imageChemin, img.buffer, { contentType: img.contentType, upsert: false });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data, error } = await admin
    .from("partenaire_messages")
    .insert({
      partenaire_id: partenaire.id,
      type,
      titre,
      texte,
      lien: body?.lien?.trim() || null,
      image_chemin: imageChemin,
      mois_cible: moisCible,
      statut: soumettre ? "soumis" : "brouillon",
      soumis_le: soumettre ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    if (imageChemin) await admin.storage.from("partenaire-messages").remove([imageChemin]).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, message: data });
}
