import { NextResponse } from "next/server";
import {
  resolvePartenaireSession,
  tracerEvenementAvantage,
  niveauActifPartenaire,
} from "../../../lib/partenaires";

export const dynamic = "force-dynamic";

// Le partenaire connecté crée lui-même un avantage. Il part EN LIGNE
// DIRECTEMENT (active: true), sans validation du bureau — c'est le choix de
// Thomas. Chaque création est tracée dans avantage_evenements pour que le
// bureau garde l'historique des offres proposées.
//
// Remplace, en version authentifiée, /api/partenaire/avantages/creer (qui
// s'appuyait sur le code PIN). L'ancienne route reste en place pour ne rien
// casser tant que la bascule n'est pas faite.
export async function POST(request) {
  const session = await resolvePartenaireSession(request);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });
  const { admin, partenaire } = session;

  const body = await request.json().catch(() => null);
  const label = body?.label?.trim();
  if (!label) return NextResponse.json({ error: "Le nom de l'avantage est obligatoire." }, { status: 400 });

  const quantiteParFamille = Number(body?.quantiteParFamille ?? body?.limite) || 1;
  if (quantiteParFamille < 1) {
    return NextResponse.json({ error: "La quantité par famille doit être d'au moins 1." }, { status: 400 });
  }

  // Quota d'avantages actifs selon le niveau de la période active
  // (null = illimité ; pas de période active = pas de limite ici, le
  // partenaire garde la main sur ses avantages même hors période).
  const { data: periodes } = await admin
    .from("partenaire_periodes")
    .select("*")
    .eq("partenaire_id", partenaire.id);
  const { config } = await niveauActifPartenaire(admin, periodes || []);
  if (config?.quota_avantages != null) {
    const { count } = await admin
      .from("avantages")
      .select("id", { count: "exact", head: true })
      .eq("partenaire_id", partenaire.id)
      .eq("active", true);
    if ((count || 0) >= config.quota_avantages) {
      return NextResponse.json(
        {
          error: `Votre niveau ${config.libelle} permet ${config.quota_avantages} avantage${config.quota_avantages > 1 ? "s" : ""} actif${config.quota_avantages > 1 ? "s" : ""}. Masquez-en un avant d'en ajouter.`,
        },
        { status: 409 }
      );
    }
  }

  const { data, error } = await admin
    .from("avantages")
    .insert({
      label,
      description: body?.description?.trim() || null,
      type: "partenaire",
      partenaire_id: partenaire.id,
      requiert_adhesion: body?.requiresMembership !== false,
      limite: quantiteParFamille,
      active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await tracerEvenementAvantage(admin, {
    avantage: data,
    action: "cree",
    partenaireId: partenaire.id,
    auteur: "partenaire",
  });

  return NextResponse.json({ ok: true, avantage: { ...data, utilisations: 0 } });
}
