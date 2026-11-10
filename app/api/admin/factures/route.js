import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import {
  validerSaisieFacture,
  creerFactureNumerotee,
  creerRecetteCompta,
  prochainNumero,
  formaterNumero,
  verifierRattachements,
} from "../../../lib/facturesEmises";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const PERM = "comptabilite";

// GET : liste des factures émises + tout ce qu'il faut au formulaire
// (séries et prochains numéros, partenaires avec leurs périodes et paiements,
// manifestations, recettes de compta encore sans facture).
export async function GET(request) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const [
    { data: factures, error },
    { data: series },
    { data: partenaires },
    { data: periodes },
    { data: paiements },
    { data: evenements },
    { data: recettes },
  ] = await Promise.all([
    admin.from("factures_emises").select("*").order("date_facture", { ascending: false }).order("numero_complet", { ascending: false }),
    admin.from("facture_series").select("*").order("ordre"),
    admin.from("partenaires").select("*").order("nom"),
    admin.from("partenaire_periodes").select("id, partenaire_id, debut, fin, niveau, montant_annonce_cents, annulee").eq("annulee", false),
    admin.from("partenaire_paiements").select("id, partenaire_id, periode_id, montant_cents, recu_le, moyen, reference"),
    admin.from("benevolat_evenements").select("id, nom").order("created_at", { ascending: false }),
    admin
      .from("compta_lignes")
      .select("id, libelle, montant_cents, date_operation, school_year")
      .eq("sens", "recette")
      .order("date_operation", { ascending: false, nullsFirst: false })
      .limit(300),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const annee = new Date().getFullYear();
  const prochains = {};
  for (const s of series || []) {
    const { numero } = await prochainNumero(admin, s.code, annee);
    prochains[s.code] = formaterNumero(s.code, annee, numero);
  }

  const lieesIds = new Set((factures || []).map((f) => f.recette_ligne_id).filter(Boolean));
  const paiementsUtilises = new Set((factures || []).map((f) => f.partenaire_paiement_id).filter(Boolean));
  const nomPartenaire = Object.fromEntries((partenaires || []).map((p) => [p.id, p.nom]));

  return NextResponse.json({
    ok: true,
    factures: (factures || []).map((f) => ({ ...f, partenaireNom: nomPartenaire[f.partenaire_id] || null })),
    series: series || [],
    prochains,
    partenaires: (partenaires || []).map((p) => ({
      id: p.id,
      nom: p.nom,
      raison_sociale: p.raison_sociale || null,
      forme_juridique: p.forme_juridique || null,
      siren: p.siren || null,
      adresse: p.adresse || null,
      code_postal: p.code_postal || null,
      ville: p.ville || null,
    })),
    periodes: periodes || [],
    paiements: (paiements || []).filter((p) => !paiementsUtilises.has(p.id)),
    evenements: evenements || [],
    recettesLibres: (recettes || []).filter((r) => !lieesIds.has(r.id)),
  });
}

// POST : émet une facture (numéro attribué automatiquement) et crée la recette
// correspondante en compta (sauf creerRecette === false).
export async function POST(request) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const { data: series } = await admin.from("facture_series").select("code");
  const saisie = validerSaisieFacture(body, (series || []).map((s) => s.code));
  if (saisie.error) return NextResponse.json({ error: saisie.error }, { status: 400 });

  const erreurLien = await verifierRattachements(admin, saisie.valeurs);
  if (erreurLien) return NextResponse.json({ error: erreurLien }, { status: 400 });

  const creerRecette = body.creerRecette !== false;
  if (creerRecette && body.rubrique === "evenement" && !body.evenementId) {
    return NextResponse.json({ error: "Choisissez la manifestation pour classer la recette." }, { status: 400 });
  }

  const { facture, error } = await creerFactureNumerotee(admin, saisie.valeurs, auth.parent.id);
  if (error) return NextResponse.json({ error }, { status: 409 });

  let recetteErreur = null;
  if (creerRecette) {
    const r = await creerRecetteCompta(admin, facture, {
      rubrique: body.rubrique,
      evenementId: body.evenementId,
      parentId: auth.parent.id,
    });
    if (r.error) recetteErreur = r.error;
  }

  return NextResponse.json({ ok: true, facture, recetteErreur });
}
