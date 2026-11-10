import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { creerRecetteCompta, verifierRattachements } from "../../../../lib/facturesEmises";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const PERM = "comptabilite";

// PATCH { action } :
//  - "rattacher"     : relie la facture à un partenaire / une période / un paiement
//  - "annuler"       : annule la facture (le numéro reste, marqué « annulée »)
//  - "creer_recette" : crée la recette en compta si elle n'existe pas encore
//  - "lier_recette"  : relie la facture à une recette déjà saisie en compta
// Le contenu d'une facture émise (montant, client, objet, date) ne se modifie
// jamais : en cas d'erreur, on annule et on réémet.
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const body = await request.json().catch(() => null);
  const action = body?.action;

  const { data: facture } = await admin.from("factures_emises").select("*").eq("id", params.id).maybeSingle();
  if (!facture) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  if (action === "rattacher") {
    const v = {
      partenaire_id: body.partenaireId || null,
      periode_id: body.periodeId || null,
      partenaire_paiement_id: body.partenairePaiementId || null,
    };
    const erreur = await verifierRattachements(admin, v);
    if (erreur) return NextResponse.json({ error: erreur }, { status: 400 });
    const { error } = await admin.from("factures_emises").update(v).eq("id", facture.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (facture.statut === "annulee") {
    return NextResponse.json({ error: "Cette facture est annulée." }, { status: 409 });
  }

  if (action === "annuler") {
    if (facture.recette_ligne_id) {
      const { data: ligne } = await admin
        .from("compta_lignes")
        .select("id, statut")
        .eq("id", facture.recette_ligne_id)
        .maybeSingle();
      if (ligne?.statut === "pointe") {
        return NextResponse.json(
          { error: "La recette liée est déjà pointée avec le relevé bancaire : retirez d'abord son pointage en comptabilité, puis annulez la facture." },
          { status: 409 }
        );
      }
      if (ligne) await admin.from("compta_lignes").delete().eq("id", ligne.id);
    }
    const { error } = await admin
      .from("factures_emises")
      .update({ statut: "annulee", annulee_le: new Date().toISOString(), recette_ligne_id: null })
      .eq("id", facture.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "creer_recette") {
    if (facture.recette_ligne_id) return NextResponse.json({ error: "Une recette est déjà liée." }, { status: 409 });
    const r = await creerRecetteCompta(admin, facture, {
      rubrique: body.rubrique,
      evenementId: body.evenementId,
      parentId: auth.parent.id,
    });
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "lier_recette") {
    if (facture.recette_ligne_id) return NextResponse.json({ error: "Une recette est déjà liée." }, { status: 409 });
    const { data: ligne } = await admin
      .from("compta_lignes")
      .select("id, sens")
      .eq("id", body.ligneId)
      .maybeSingle();
    if (!ligne || ligne.sens !== "recette") {
      return NextResponse.json({ error: "Choisissez une ligne de recette." }, { status: 400 });
    }
    const { data: dejaLiee } = await admin
      .from("factures_emises")
      .select("numero_complet")
      .eq("recette_ligne_id", ligne.id)
      .maybeSingle();
    if (dejaLiee) {
      return NextResponse.json({ error: `Cette recette est déjà liée à la facture ${dejaLiee.numero_complet}.` }, { status: 409 });
    }
    const { error } = await admin.from("factures_emises").update({ recette_ligne_id: ligne.id }).eq("id", facture.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Action invalide." }, { status: 400 });
}
