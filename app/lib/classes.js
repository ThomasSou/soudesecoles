import { currentSchoolYear } from "./anneeScolaire";

// Liste des classes de l'école, DÉRIVÉE des fiches enfants.
//
// Il n'y a volontairement pas de table `classes` : la liste des classes et
// leurs regroupements changent chaque année (CE1-CE2 une année, CE1-CM une
// autre), et la seule source fiable est `children.class_level` pour l'année
// scolaire en cours. On recalcule donc la liste à chaque appel — elle se
// corrige d'elle-même à mesure que les fiches de l'année sont importées.
//
// Cas limite assumé : tant que les fiches de l'année en cours ne sont pas
// importées, la liste est vide (ou incomplète). Les écrans qui l'utilisent
// doivent gérer le tableau vide (proposer une saisie libre en secours).
// Ordre d'affichage : du plus petit au plus grand (maternelle puis
// élémentaire), les classes à double niveau juste après leur niveau le plus
// bas. Une classe inconnue de cette liste (regroupement inédit) passe à la
// fin, par ordre alphabétique.
export const ORDRE_CLASSES = [
  "PS", "PS-MS", "MS", "MS-GS", "GS",
  "CP", "CP-CE1", "CE1", "CE1-CE2", "CE2", "CE2-CM1", "CM1", "CM1-CM2", "CM2",
];

export function comparerClasses(a, b) {
  const ia = ORDRE_CLASSES.indexOf(a);
  const ib = ORDRE_CLASSES.indexOf(b);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b, "fr");
}

export async function listerClassesAnnee(admin, schoolYear = currentSchoolYear()) {
  const { data, error } = await admin
    .from("children")
    .select("class_level")
    .eq("school_year", schoolYear)
    .not("class_level", "is", null);

  if (error) {
    return { classes: [], schoolYear, error: error.message };
  }

  // Distinct + nettoyage + tri scolaire, côté application (Supabase REST ne
  // fait pas de `select distinct`).
  const set = new Set();
  for (const row of data || []) {
    const label = (row.class_level || "").trim();
    if (label) set.add(label);
  }
  const classes = [...set].sort(comparerClasses);

  return { classes, schoolYear, error: null };
}
