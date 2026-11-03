import { NextResponse } from "next/server";
import { resolvePartenaireSession } from "../../../lib/partenaires";
import { nettoyerContenu, contenuInitial } from "../../../lib/partenairePages";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// GET : l'état de la page du partenaire connecté (brouillon, statut, motif).
export async function GET(request) {
  const session = await resolvePartenaireSession(request);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });
  const { admin, partenaire } = session;

  const { data: page } = await admin
    .from("partenaire_pages")
    .select("*")
    .eq("partenaire_id", partenaire.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    slug: partenaire.slug || null,
    statut: page?.statut || "aucune",
    motifRefus: page?.motif_refus || null,
    soumisLe: page?.soumis_le || null,
    publieLe: page?.publie_le || null,
    aUnePublication: Boolean(page?.publie),
    contenu: page?.brouillon || page?.publie || contenuInitial(partenaire.slug),
  });
}

// PUT : enregistre le brouillon ; `soumettre: true` l'envoie au bureau.
export async function PUT(request) {
  const session = await resolvePartenaireSession(request);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });
  const { admin, partenaire } = session;

  const body = await request.json().catch(() => null);
  if (!body?.contenu) return NextResponse.json({ error: "Contenu manquant." }, { status: 400 });

  const contenu = nettoyerContenu(body.contenu, partenaire.id);
  const soumettre = body.soumettre === true;
  if (soumettre && contenu.modules.length === 0) {
    return NextResponse.json({ error: "Ajoutez au moins un bloc avant d'envoyer la page au bureau." }, { status: 400 });
  }

  const { data: existante } = await admin
    .from("partenaire_pages")
    .select("statut, publie")
    .eq("partenaire_id", partenaire.id)
    .maybeSingle();

  // Une page en attente de validation n'est plus modifiable (le bureau
  // relit exactement ce qui lui a été envoyé).
  if (existante?.statut === "soumis") {
    return NextResponse.json({ error: "Votre page est en cours de relecture par le bureau." }, { status: 409 });
  }

  const maintenant = new Date().toISOString();
  const ligne = {
    partenaire_id: partenaire.id,
    brouillon: contenu,
    updated_at: maintenant,
    statut: soumettre ? "soumis" : existante?.statut === "publie" ? "publie" : "brouillon",
    motif_refus: null,
    ...(soumettre ? { soumis_le: maintenant } : {}),
  };
  const { error } = await admin.from("partenaire_pages").upsert(ligne, { onConflict: "partenaire_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, statut: ligne.statut, contenu });
}
