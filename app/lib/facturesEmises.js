// Factures émises par le Sou (partenariats, tables du marché...). Numérotation
// chronologique continue par série et par année, sans trou : une facture ne se
// supprime jamais, elle s'annule. Les DONS ne se facturent jamais (reçu fiscal
// Cerfa 2041-MEC-SD) : une facture peut seulement mentionner un don séparé.

import { currentSchoolYear } from "./anneeScolaire";

// Coordonnées de l'association, imprimées sur chaque facture.
export const SOU = {
  nom: "Sou des Écoles Laïques Montmerle-Lurcy",
  adresse: "1 parvis des Enfants d'Izieu",
  codePostal: "01090",
  ville: "Montmerle-sur-Saône",
  siret: "312 951 924 00017",
  rna: "W012000231",
  president: "Thomas Ondet",
  mentionTva: "Association non assujettie à la TVA",
};

export const MOYENS_FACTURE = {
  virement: "virement",
  cheque: "chèque",
  cb: "carte bancaire",
  especes: "espèces",
  prelevement: "prélèvement",
  autre: "autre moyen de paiement",
};

export function formaterNumero(serie, annee, numero) {
  return `${serie}${annee}-${String(numero).padStart(3, "0")}`;
}

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
function dateValide(v) {
  if (typeof v !== "string" || !DATE_ISO.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// Un don ne se facture pas. Refus d'un objet qui n'est qu'un don.
const OBJET_DON = /^\s*(un |le |les |des |notre |votre )?(don|dons|mécénat|mecenat)\b/i;

// Valide la saisie d'une facture. Renvoie { error } ou { valeurs } (montants
// en centimes, textes nettoyés).
export function validerSaisieFacture(body, seriesConnues) {
  const texte = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const serie = texte(body?.serie, 8).toUpperCase();
  if (!seriesConnues.includes(serie)) return { error: "Choisissez la série de la facture." };

  const typePiece = body?.typePiece === "recu" ? "recu" : "facture";
  const dateFacture = body?.dateFacture;
  if (!dateValide(dateFacture)) return { error: "La date de la facture est invalide." };
  const acquitteeLe = body?.acquitteeLe;
  if (!dateValide(acquitteeLe)) return { error: "La date d'acquittement est obligatoire." };
  const moyen = body?.moyenPaiement;
  if (!Object.keys(MOYENS_FACTURE).includes(moyen)) {
    return { error: "Indiquez le moyen de paiement (virement, chèque…)." };
  }

  const raison = texte(body?.clientRaisonSociale, 160);
  if (!raison) return { error: "La raison sociale du client est obligatoire." };

  const siren = texte(body?.clientSiren, 20).replace(/[\s.]/g, "");
  if (siren && !/^\d{9}$/.test(siren)) {
    return { error: "Le SIREN doit comporter 9 chiffres." };
  }

  const objet = texte(body?.objet, 300);
  if (!objet) return { error: "L'objet de la facture est obligatoire." };
  if (OBJET_DON.test(objet)) {
    return {
      error:
        "Un don ne se facture pas : il fait l'objet d'un reçu fiscal (Cerfa 2041-MEC-SD). Facturez seulement la contrepartie (partenariat, table, emplacement…).",
    };
  }

  const montant = Number(String(body?.montant ?? "").replace(",", "."));
  if (!Number.isFinite(montant) || montant <= 0) return { error: "Le montant doit être supérieur à 0." };

  let donCents = null;
  if (body?.donAssocie !== undefined && body?.donAssocie !== null && String(body.donAssocie).trim() !== "") {
    const don = Number(String(body.donAssocie).replace(",", "."));
    if (!Number.isFinite(don) || don <= 0) return { error: "Le montant du don associé est invalide." };
    donCents = Math.round(don * 100);
  }

  return {
    valeurs: {
      serie,
      type_piece: typePiece,
      annee: Number(dateFacture.slice(0, 4)),
      date_facture: dateFacture,
      client_raison_sociale: raison,
      client_forme: texte(body?.clientForme, 60) || null,
      client_siren: siren || null,
      client_adresse: texte(body?.clientAdresse, 250) || null,
      client_code_postal: texte(body?.clientCodePostal, 12) || null,
      client_ville: texte(body?.clientVille, 80) || null,
      objet,
      montant_cents: Math.round(montant * 100),
      acquittee_le: acquitteeLe,
      moyen_paiement: moyen,
      paiement_reference: texte(body?.paiementReference, 120) || null,
      don_associe_cents: donCents,
      partenaire_id: body?.partenaireId || null,
      periode_id: body?.periodeId || null,
      partenaire_paiement_id: body?.partenairePaiementId || null,
    },
  };
}

// Prochain numéro libre d'une série pour une année : le plus grand numéro
// enregistré ou déjà utilisé hors du site, plus un.
export async function prochainNumero(admin, serie, annee) {
  const [{ data: dernieres }, { data: horsSite }] = await Promise.all([
    admin
      .from("factures_emises")
      .select("numero, date_facture")
      .eq("serie", serie)
      .eq("annee", annee)
      .order("numero", { ascending: false })
      .limit(1),
    admin
      .from("facture_numeros_hors_site")
      .select("dernier_numero")
      .eq("serie", serie)
      .eq("annee", annee)
      .maybeSingle(),
  ]);
  const dernier = dernieres?.[0] || null;
  return {
    numero: Math.max(dernier?.numero || 0, horsSite?.dernier_numero || 0) + 1,
    dateDerniere: dernier?.date_facture || null,
  };
}

// Crée la facture avec son numéro. Deux créations simultanées se départagent
// par la contrainte d'unicité (serie, annee, numero) : la perdante recommence
// avec le numéro suivant — aucun numéro n'est consommé par un échec.
export async function creerFactureNumerotee(admin, valeurs, parentId) {
  for (let essai = 0; essai < 5; essai++) {
    const { numero, dateDerniere } = await prochainNumero(admin, valeurs.serie, valeurs.annee);
    // Numérotation chronologique : pas de facture antidatée par rapport à la précédente.
    if (dateDerniere && valeurs.date_facture < dateDerniere) {
      return {
        error: `La date doit être postérieure ou égale à celle de la facture précédente de la série (${dateDerniere.split("-").reverse().join("/")}) : la numérotation est chronologique.`,
      };
    }
    const { data, error } = await admin
      .from("factures_emises")
      .insert({
        ...valeurs,
        numero,
        numero_complet: formaterNumero(valeurs.serie, valeurs.annee, numero),
        created_by: parentId || null,
      })
      .select("*")
      .single();
    if (!error) return { facture: data };
    if (error.code !== "23505") return { error: error.message };
  }
  return { error: "Numérotation impossible pour le moment (conflit). Réessayez." };
}

// Recette correspondante en comptabilité : une ligne « recette », à pointer
// ensuite avec le relevé bancaire, liée à la facture.
export async function creerRecetteCompta(admin, facture, { rubrique, evenementId, parentId }) {
  const rub = ["evenement", "investissement", "courant"].includes(rubrique) ? rubrique : "courant";
  if (rub === "evenement" && !evenementId) {
    return { error: "Choisissez la manifestation pour classer la recette." };
  }
  const { data: ligne, error } = await admin
    .from("compta_lignes")
    .insert({
      sens: "recette",
      rubrique: rub,
      evenement_id: rub === "evenement" ? evenementId : null,
      libelle: `Facture ${facture.numero_complet} — ${facture.objet}`.slice(0, 250),
      fournisseur: facture.client_raison_sociale,
      montant_cents: facture.montant_cents,
      date_operation: facture.acquittee_le,
      statut: "a_verifier",
      source: "manuel",
      school_year: currentSchoolYear(new Date(`${facture.acquittee_le}T12:00:00Z`)),
      created_by: parentId || null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  if (rub === "evenement") {
    await admin.from("compta_ligne_evenements").insert({ ligne_id: ligne.id, evenement_id: evenementId });
  }
  await admin.from("factures_emises").update({ recette_ligne_id: ligne.id }).eq("id", facture.id);
  return { ligneId: ligne.id };
}

export function adresseClient(f) {
  return [f.client_adresse, [f.client_code_postal, f.client_ville].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

// Vérifie que période et paiement appartiennent bien au partenaire choisi.
export async function verifierRattachements(admin, v) {
  if (v.partenaire_id) {
    const { data } = await admin.from("partenaires").select("id").eq("id", v.partenaire_id).maybeSingle();
    if (!data) return "Partenaire introuvable.";
  } else if (v.periode_id || v.partenaire_paiement_id) {
    return "Choisissez d'abord le partenaire.";
  }
  if (v.periode_id) {
    const { data } = await admin
      .from("partenaire_periodes")
      .select("id")
      .eq("id", v.periode_id)
      .eq("partenaire_id", v.partenaire_id)
      .maybeSingle();
    if (!data) return "Cette période n'appartient pas à ce partenaire.";
  }
  if (v.partenaire_paiement_id) {
    const { data } = await admin
      .from("partenaire_paiements")
      .select("id")
      .eq("id", v.partenaire_paiement_id)
      .eq("partenaire_id", v.partenaire_id)
      .maybeSingle();
    if (!data) return "Ce paiement n'appartient pas à ce partenaire.";
  }
  return null;
}
