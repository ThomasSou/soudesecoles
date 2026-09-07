// Référence figée des classes de l'école, avec le nom de l'enseignant·e.
// Le bureau l'a demandé pour lever toute ambiguïté (il y a par exemple deux
// CE2). Utilisée par le sélecteur de classes de la comptabilité.
//
// La table `compta_ligne_classes` stocke la `cle` ci-dessous (pas le libellé
// affiché) : corriger un nom d'enseignant ici ne casse donc pas le compte
// par classe et n'oblige à aucune migration.
//
// Équipe 2026-2027. Si les classes changent (regroupements, enseignants),
// éditer ce fichier — c'est le seul endroit.

export const CLASSES_REFERENCE = [
  // Maternelle — 5 classes.
  { cle: "mat-ps", groupe: "maternelle", niveau: "PS", enseignant: "Nancy Olivier" },
  { cle: "mat-ps-ms", groupe: "maternelle", niveau: "PS-MS", enseignant: "Nathalie Bouquin" },
  { cle: "mat-ms", groupe: "maternelle", niveau: "MS", enseignant: "Amandine Croze" },
  { cle: "mat-ms-gs", groupe: "maternelle", niveau: "MS-GS", enseignant: "Alexandra Elie" },
  { cle: "mat-gs", groupe: "maternelle", niveau: "GS", enseignant: "Cécile Perdreaux" },

  // Élémentaire — 8 classes (deux CE2, distinguées par l'enseignante).
  { cle: "elem-cp", groupe: "elementaire", niveau: "CP", enseignant: "Céline Bongibault" },
  { cle: "elem-cp-ce1", groupe: "elementaire", niveau: "CP-CE1", enseignant: "Stéphanie Martinaud" },
  { cle: "elem-ce1", groupe: "elementaire", niveau: "CE1", enseignant: "Carole Mosnier" },
  { cle: "elem-ce2-mosca", groupe: "elementaire", niveau: "CE2", enseignant: "Mosca-Guillaud et Petrozzi" },
  { cle: "elem-ce2-geenaert", groupe: "elementaire", niveau: "CE2", enseignant: "Geenaert" },
  { cle: "elem-cm1", groupe: "elementaire", niveau: "CM1", enseignant: "Breton" },
  { cle: "elem-cm1-cm2", groupe: "elementaire", niveau: "CM1-CM2", enseignant: "Latorre et Plosin" },
  { cle: "elem-cm2", groupe: "elementaire", niveau: "CM2", enseignant: "D'Acunto" },
];

export const GROUPES_CLASSES = {
  maternelle: "Maternelle",
  elementaire: "Élémentaire",
};

const PAR_CLE = Object.fromEntries(CLASSES_REFERENCE.map((c) => [c.cle, c]));

export const CLES_CLASSES = CLASSES_REFERENCE.map((c) => c.cle);

// Libellé affiché d'une classe. Retombe sur la valeur brute si elle n'est
// pas dans la référence (ex. libellé hérité d'une facture enseignant).
export function libelleClasse(cle) {
  const c = PAR_CLE[cle];
  return c ? `${c.niveau} · ${c.enseignant}` : cle;
}
