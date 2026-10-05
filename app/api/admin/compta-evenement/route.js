import { NextResponse } from "next/server";
import { requireComptaEvenements } from "../../../lib/adminAuth";
import { currentSchoolYear } from "../../../lib/anneeScolaire";
import { televerserJustificatif, TYPES_JUSTIFICATIF } from "../../../lib/comptaFichiers";
import { repartirEgal } from "../../../lib/comptaRepartition";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const SENS = ["depense", "recette"];

// Compta limitée aux manifestations accordées à la personne (cf.
// permissions.compta_evenements dans adminAuth.js) : des bénévoles saisissent
// leurs factures et recettes pour « leur » événement sans accéder au reste de
// la compta. Leurs lignes arrivent « à valider » : le bureau les relit dans la
// compta complète, comme les demandes de remboursement.

function partsDeLigne(ligne, idsEvenements, montantsParEvt) {
  if (montantsParEvt && Object.keys(montantsParEvt).length) {
    return Object.fromEntries(idsEvenements.map((id) => [id, montantsParEvt[id] || 0]));
  }
  const parts = repartirEgal(ligne.montant_cents, idsEvenements.length);
  return Object.fromEntries(idsEvenements.map((id, i) => [id, parts[i]]));
}

export async function GET(request) {
  const auth = await requireComptaEvenements(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const annee = new URL(request.url).searchParams.get("annee") || currentSchoolYear();

  let reqEvt = admin.from("benevolat_evenements").select("id, nom").order("nom");
  if (auth.evenementIds) reqEvt = reqEvt.in("id", auth.evenementIds);
  const { data: evenements, error: eEvt } = await reqEvt;
  if (eEvt) return NextResponse.json({ error: eEvt.message }, { status: 500 });

  const idsAutorises = (evenements || []).map((e) => e.id);
  if (idsAutorises.length === 0) {
    return NextResponse.json({ ok: true, annee, evenements: [], lignes: [], moi: auth.parent.id });
  }

  const { data: liens } = await admin
    .from("compta_ligne_evenements")
    .select("*")
    .in("evenement_id", idsAutorises);

  const ligneIds = [...new Set((liens || []).map((l) => l.ligne_id))];
  const { data: lignesBrutes, error } = ligneIds.length
    ? await admin
        .from("compta_lignes")
        .select("*")
        .in("id", ligneIds)
        .eq("school_year", annee)
        .eq("rubrique", "evenement")
        .order("date_operation", { ascending: false, nullsFirst: true })
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Toutes les manifestations d'une ligne (même celles qui ne sont pas
  // accordées à la personne) pour calculer les parts d'une dépense commune.
  const idsLignes = (lignesBrutes || []).map((l) => l.id);
  const { data: tousLiens } = idsLignes.length
    ? await admin.from("compta_ligne_evenements").select("*").in("ligne_id", idsLignes)
    : { data: [] };
  const liensParLigne = {};
  for (const l of tousLiens || []) (liensParLigne[l.ligne_id] ||= []).push(l);

  const totaux = {};
  for (const e of evenements) {
    totaux[e.id] = {
      realise: { depense_cents: 0, recette_cents: 0 },
      previsionnel: { depense_cents: 0, recette_cents: 0 },
    };
  }

  const lignes = (lignesBrutes || []).map((l) => {
    const liensLigne = liensParLigne[l.id] || [];
    const idsEvt = liensLigne.map((x) => x.evenement_id);
    const montantsEvt = {};
    for (const x of liensLigne) if (x.montant_cents != null) montantsEvt[x.evenement_id] = x.montant_cents;
    const parts = partsDeLigne(l, idsEvt, montantsEvt);

    const previsionnel = l.statut === "prevu" || l.statut === "a_valider";
    for (const id of idsEvt) {
      if (!totaux[id]) continue;
      totaux[id][previsionnel ? "previsionnel" : "realise"][
        l.sens === "depense" ? "depense_cents" : "recette_cents"
      ] += parts[id] || 0;
    }

    const mienne = l.created_by === auth.parent.id;
    const modifiable = mienne && l.source === "manuel" && (l.statut === "a_valider" || l.statut === "prevu");
    return {
      id: l.id,
      sens: l.sens,
      libelle: l.libelle,
      fournisseur: l.fournisseur,
      montant_cents: l.montant_cents,
      date_operation: l.date_operation,
      statut: l.statut,
      note: l.note || null,
      evenements: idsEvt.filter((id) => idsAutorises.includes(id)),
      partagee: idsEvt.length > 1,
      avanceParMoi: l.paye_par === "benevole" && l.paye_par_parent_id === auth.parent.id,
      a_justificatif: Boolean(l.justificatif_path),
      justificatif_type: l.justificatif_type || null,
      mienne,
      modifiable,
    };
  });

  return NextResponse.json({ ok: true, annee, evenements, totaux, lignes, moi: auth.parent.id });
}

export async function POST(request) {
  const auth = await requireComptaEvenements(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const body = await request.json().catch(() => null);
  const sens = body?.sens;
  const libelle = body?.libelle?.trim();
  const fournisseur = body?.fournisseur?.trim() || null;
  const montant = Number(String(body?.montant ?? "").replace(",", "."));
  const dateOperation = body?.dateOperation || null;
  const note = body?.note?.trim() || null;
  const evenementId = body?.evenementId ? String(body.evenementId) : null;
  const avanceParMoi = body?.payePar === "moi";
  const annee = currentSchoolYear();

  if (!SENS.includes(sens)) {
    return NextResponse.json({ error: "Choisissez dépense ou recette." }, { status: 400 });
  }
  if (!evenementId || (auth.evenementIds && !auth.evenementIds.includes(evenementId))) {
    return NextResponse.json({ error: "Manifestation non autorisée." }, { status: 403 });
  }
  if (!libelle) return NextResponse.json({ error: "Donnez un libellé à la ligne." }, { status: 400 });
  if (!fournisseur) {
    return NextResponse.json(
      { error: sens === "recette" ? "Indiquez l'origine de la recette." : "Le fournisseur est obligatoire." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(montant) || montant <= 0) {
    return NextResponse.json({ error: "Le montant doit être supérieur à 0." }, { status: 400 });
  }

  // Un devis est une dépense prévisionnelle (pas encore engagée) : pas de
  // date exigée. Tout le reste doit porter une date.
  const estDevis = body?.justificatifDataUrl && body?.justificatifType === "devis";
  if (!estDevis && !dateOperation) {
    return NextResponse.json({ error: "La date est obligatoire." }, { status: 400 });
  }

  const montantCents = Math.round(montant * 100);

  // Même garde-fou anti-doublon que la compta complète : un bénévole peut
  // très bien saisir deux fois la même facture.
  if (!body?.ignorerDoublon) {
    const { data: memeMontant } = await admin
      .from("compta_lignes")
      .select("id, libelle, date_operation, statut, fournisseur")
      .eq("school_year", annee)
      .eq("sens", sens)
      .eq("montant_cents", montantCents);
    const cible = fournisseur.toLowerCase();
    const similaires = (memeMontant || []).filter(
      (l) => (l.fournisseur || "").trim().toLowerCase() === cible
    );
    if (similaires.length > 0) {
      return NextResponse.json(
        {
          doublonPossible: true,
          message: `Attention : une ligne existe déjà avec « ${fournisseur} » au même montant (${(montantCents / 100).toFixed(2)} €) cette année. Est-ce bien une autre facture ?`,
        },
        { status: 409 }
      );
    }
  }

  const nouvelle = {
    sens,
    rubrique: "evenement",
    evenement_id: evenementId,
    libelle,
    fournisseur,
    montant_cents: montantCents,
    date_operation: dateOperation,
    statut: estDevis ? "prevu" : "a_valider",
    source: "manuel",
    note,
    school_year: annee,
    created_by: auth.parent.id,
  };
  if (sens === "depense" && avanceParMoi) {
    nouvelle.paye_par = "benevole";
    nouvelle.paye_par_parent_id = auth.parent.id;
  }

  const { data: ligne, error } = await admin.from("compta_lignes").insert(nouvelle).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: eLien } = await admin
    .from("compta_ligne_evenements")
    .insert({ ligne_id: ligne.id, evenement_id: evenementId });
  if (eLien) {
    await admin.from("compta_lignes").delete().eq("id", ligne.id);
    return NextResponse.json({ error: eLien.message }, { status: 500 });
  }

  if (body?.justificatifDataUrl) {
    const type = TYPES_JUSTIFICATIF.includes(body?.justificatifType)
      ? body.justificatifType
      : "facture_definitive";
    const { path, error: eFichier } = await televerserJustificatif(admin, ligne.id, body.justificatifDataUrl);
    if (eFichier) {
      await admin.from("compta_lignes").delete().eq("id", ligne.id);
      return NextResponse.json({ error: eFichier }, { status: 400 });
    }
    await admin
      .from("compta_lignes")
      .update({ justificatif_path: path, justificatif_type: type })
      .eq("id", ligne.id);
  }

  return NextResponse.json({ ok: true, id: ligne.id });
}
