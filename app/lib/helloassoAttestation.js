import { normaliser } from "./releveCA";
import { exerciceDeLaDate } from "./comptaPointage";

// Lecture de l'« attestation de versement » HelloAsso (PDF envoyé à chaque
// virement). Elle détaille ce que contient le virement par campagne :
//
//   Boutique  Foire de Montmerle 2025   Produits : 646.50€  Dons : 15€   661.50€
//   Adhésion  Cotisation Sou des Ecoles Adhésions : 528€                 528€
//   Sous-total 702.50€
//
// L'extraction de texte du PDF colle les cellules entre elles
// (« BoutiqueArtisans Marché de Noël 2025Produits : 98€98€ ») : on ne s'appuie
// donc que sur les montants. Chaque campagne se termine par son total, qui doit
// égaler la somme de ses lignes ; la somme des totaux doit égaler le virement.
// Au moindre écart, on refuse de deviner (la comptabilité doit rester juste).

const LIGNES = "Produits|Adhésions|Adhesions|Dons|Billetterie|Cotisations|Inscriptions|Participations|Paiements";
const MOTIF = new RegExp(
  `(${LIGNES})\\s*:\\s*(\\d+(?:[.,]\\d+)?)\\s*€|(\\d+(?:[.,]\\d+)?)\\s*€`,
  "g"
);

const enCentimes = (t) => Math.round(parseFloat(String(t).replace(",", ".")) * 100);

const LIBELLE_LIGNE = {
  produits: "ventes",
  adhesions: "cotisations",
  cotisations: "cotisations",
  dons: "dons",
  billetterie: "billetterie",
  inscriptions: "inscriptions",
  participations: "participations",
  paiements: "paiements",
};

export function analyserAttestation(texte) {
  const brut = String(texte || "").replace(/\r/g, "");

  const mMontant = brut.match(/montant de\s*(\d+(?:[.,]\d+)?)\s*euros?/i);
  const mNumero = brut.match(/Versement n°\s*(\d+)/i);
  const mDate = brut.match(/Virement émis le\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!mMontant || !/Attestation de versement|Tableau récapitulatif/i.test(brut)) {
    return { erreur: "Ce document ne ressemble pas à une attestation de versement HelloAsso." };
  }
  const montantCents = enCentimes(mMontant[1]);

  const mDebut = /\(période du[^)]*\)\s*:/i.exec(brut);
  const fin = brut.search(/Sous-total/i);
  if (!mDebut || fin === -1 || fin < mDebut.index) {
    return { erreur: "Le tableau des campagnes est introuvable dans ce document." };
  }
  const section = brut.slice(mDebut.index + mDebut[0].length, fin);

  const blocs = [];
  let precedentFin = 0;
  let courant = { items: [], debut: null };
  let m;
  MOTIF.lastIndex = 0;
  while ((m = MOTIF.exec(section))) {
    if (m[1]) {
      if (courant.debut === null) courant.debut = m.index;
      courant.items.push({ cle: normaliser(m[1]), cents: enCentimes(m[2]) });
    } else {
      // Montant isolé : le total de la campagne en cours.
      const totalCents = enCentimes(m[3]);
      const debutTexte = courant.debut === null ? m.index : courant.debut;
      let items = courant.items;
      if (items.length === 0) items = [{ cle: "paiements", cents: totalCents }];
      blocs.push({ texteAvant: section.slice(precedentFin, debutTexte), items, totalCents });
      precedentFin = m.index + m[0].length;
      courant = { items: [], debut: null };
    }
  }
  if (blocs.length === 0) return { erreur: "Aucune campagne trouvée dans le tableau." };

  const resultat = blocs.map((b) => {
    const nettoye = b.texteAvant.replace(/\s+/g, " ").trim();
    const mType = nettoye.match(/^(Boutique|Adhésion|Adhesion|Billetterie|Don|Collecte|Événement|Evenement|Crowdfunding)\s*/i);
    return {
      type: mType ? mType[1] : "",
      nom: (mType ? nettoye.slice(mType[0].length) : nettoye).trim(),
      lignes: b.items.map((i) => ({ libelle: LIBELLE_LIGNE[i.cle] || i.cle, cents: i.cents })),
      totalCents: b.totalCents,
    };
  });

  for (const b of resultat) {
    const somme = b.lignes.reduce((s, l) => s + l.cents, 0);
    if (somme !== b.totalCents) {
      return { erreur: `Lecture douteuse pour « ${b.nom || "une campagne"} » (lignes et total ne concordent pas). Saisissez la répartition à la main.` };
    }
  }
  const total = resultat.reduce((s, b) => s + b.totalCents, 0);
  if (total !== montantCents) {
    return { erreur: "Lecture douteuse : la somme des campagnes ne correspond pas au montant du versement. Saisissez la répartition à la main." };
  }

  return {
    numero: mNumero ? mNumero[1] : null,
    date: mDate ? `${mDate[3]}-${mDate[2]}-${mDate[1]}` : null,
    montantCents,
    campagnes: resultat,
  };
}

// Manifestation correspondant à une campagne : celle dont le nom (sans
// l'année) est contenu dans le nom de la campagne — « Vente Marché de Noël
// 2025 » -> « Marché de Noël ». Le nom le plus long l'emporte.
export function evenementDeLaCampagne(nomCampagne, evenements) {
  const campagne = ` ${normaliser(nomCampagne).replace(/\b\d{4}\b/g, " ").replace(/\s+/g, " ").trim()} `;
  let meilleur = null;
  for (const ev of evenements || []) {
    const nom = normaliser(ev.nom).replace(/\b\d{4}\b/g, " ").replace(/\s+/g, " ").trim();
    if (nom.length >= 4 && campagne.includes(` ${nom}`) && (!meilleur || nom.length > meilleur.nomLong)) {
      meilleur = { id: ev.id, nomLong: nom.length };
    }
  }
  return meilleur?.id || null;
}

// Parts proposées pour la répartition rapide : une par ligne de campagne.
export function partsDepuisAttestation(attestation, evenements, dateOperation) {
  const annee = exerciceDeLaDate(dateOperation);
  const parts = [];
  for (const c of attestation.campagnes) {
    const estAdhesion = /adh[eé]sion/i.test(c.type) || /adh[eé]sion|cotisation/i.test(c.nom);
    const evenementId = estAdhesion ? null : evenementDeLaCampagne(c.nom, evenements);
    const nom = c.nom || c.type || "Campagne HelloAsso";
    for (const l of c.lignes) {
      parts.push({
        rubrique: evenementId ? "evenement" : "courant",
        evenementId,
        libelle: `HelloAsso — ${nom} (${l.libelle})`.slice(0, 200),
        montantCents: l.cents,
        annee,
      });
    }
  }
  return parts;
}
