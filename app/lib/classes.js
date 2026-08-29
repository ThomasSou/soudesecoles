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
export async function listerClassesAnnee(admin, schoolYear = currentSchoolYear()) {
  const { data, error } = await admin
    .from("children")
    .select("class_level")
    .eq("school_year", schoolYear)
    .not("class_level", "is", null);

  if (error) {
    return { classes: [], schoolYear, error: error.message };
  }

  // Distinct + nettoyage + tri alphabétique, côté application (Supabase REST
  // ne fait pas de `select distinct`).
  const set = new Set();
  for (const row of data || []) {
    const label = (row.class_level || "").trim();
    if (label) set.add(label);
  }
  const classes = [...set].sort((a, b) => a.localeCompare(b, "fr"));

  return { classes, schoolYear, error: null };
}
