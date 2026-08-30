import { NextResponse } from "next/server";
import {
  resolvePartenaireSession,
  niveauActifPartenaire,
  compterMessagesMois,
  moisCourant,
} from "../../../../lib/partenaires";

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

// GET : URL signée (5 min) vers l'image du message (si présente).
export async function GET(request, { params }) {
  const session = await resolvePartenaireSession(request);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });
  const { admin, partenaire } = session;

  const { data: message } = await admin
    .from("partenaire_messages")
    .select("image_chemin")
    .eq("id", params.id)
    .eq("partenaire_id", partenaire.id)
    .maybeSingle();

  if (!message) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
  if (!message.image_chemin) return NextResponse.json({ ok: true, url: null });

  const { data, error } = await admin.storage
    .from("partenaire-messages")
    .createSignedUrl(message.image_chemin, 300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, url: data.signedUrl });
}

// PATCH : le partenaire modifie SON message tant qu'il est en 'brouillon' ou
// 'refuse' (corriger puis re-soumettre). `soumettre: true` le passe en
// 'soumis' avec vérification du quota. Un message 'soumis' / 'valide' /
// 'publie' n'est plus modifiable par le partenaire.
export async function PATCH(request, { params }) {
  const session = await resolvePartenaireSession(request);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });
  const { admin, partenaire } = session;

  const { data: message } = await admin
    .from("partenaire_messages")
    .select("*")
    .eq("id", params.id)
    .eq("partenaire_id", partenaire.id)
    .maybeSingle();

  if (!message) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
  if (!["brouillon", "refuse"].includes(message.statut)) {
    return NextResponse.json(
      { error: "Ce message est déjà soumis : il n'est plus modifiable." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => null);
  const update = { updated_at: new Date().toISOString() };
  if (typeof body?.titre === "string" && body.titre.trim()) update.titre = body.titre.trim();
  if (typeof body?.texte === "string" && body.texte.trim()) update.texte = body.texte.trim();
  if (typeof body?.lien === "string") update.lien = body.lien.trim() || null;
  if (typeof body?.moisCible === "string" && body.moisCible.trim()) update.mois_cible = body.moisCible.trim();

  // Image : remplacement ou suppression.
  if (body?.supprimerImage === true && message.image_chemin) {
    await admin.storage.from("partenaire-messages").remove([message.image_chemin]).catch(() => {});
    update.image_chemin = null;
  } else if (body?.imageDataUrl) {
    const img = decodeImage(body.imageDataUrl);
    if (!img) return NextResponse.json({ error: "Image invalide ou trop lourde (10 Mo max)." }, { status: 400 });
    const chemin = `${partenaire.id}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${img.ext}`;
    const { error: upErr } = await admin.storage
      .from("partenaire-messages")
      .upload(chemin, img.buffer, { contentType: img.contentType, upsert: false });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    if (message.image_chemin) {
      await admin.storage.from("partenaire-messages").remove([message.image_chemin]).catch(() => {});
    }
    update.image_chemin = chemin;
  }

  if (body?.soumettre === true) {
    const type = message.type;
    const moisCible = update.mois_cible || message.mois_cible || moisCourant();
    const { data: periodes } = await admin
      .from("partenaire_periodes")
      .select("*")
      .eq("partenaire_id", partenaire.id);
    const { config } = await niveauActifPartenaire(admin, periodes || []);
    if (!config) {
      return NextResponse.json(
        { error: "Aucune période de partenariat active : impossible de soumettre." },
        { status: 403 }
      );
    }
    const quota = type === "reseau" ? config.quota_reseau ?? 0 : config.quota_email ?? 0;
    const utilises = await compterMessagesMois(admin, partenaire.id, type, moisCible);
    if (utilises >= quota) {
      return NextResponse.json(
        { error: `Quota atteint pour ${moisCible} (${quota} / mois, niveau ${config.libelle}).` },
        { status: 409 }
      );
    }
    update.statut = "soumis";
    update.soumis_le = new Date().toISOString();
    update.motif_refus = null;
  }

  const { data, error } = await admin
    .from("partenaire_messages")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, message: data });
}

// DELETE : uniquement un brouillon ou un message refusé.
export async function DELETE(request, { params }) {
  const session = await resolvePartenaireSession(request);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });
  const { admin, partenaire } = session;

  const { data: message } = await admin
    .from("partenaire_messages")
    .select("statut, image_chemin")
    .eq("id", params.id)
    .eq("partenaire_id", partenaire.id)
    .maybeSingle();

  if (!message) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
  if (!["brouillon", "refuse"].includes(message.statut)) {
    return NextResponse.json({ error: "Seul un brouillon ou un message refusé peut être supprimé." }, { status: 409 });
  }

  if (message.image_chemin) {
    await admin.storage.from("partenaire-messages").remove([message.image_chemin]).catch(() => {});
  }
  const { error } = await admin.from("partenaire_messages").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
