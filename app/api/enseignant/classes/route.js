import { NextResponse } from "next/server";
import { requireEnseignant } from "../../../lib/enseignantAuth";
import { listerClassesAnnee } from "../../../lib/classes";
import { currentSchoolYear } from "../../../lib/anneeScolaire";

export const dynamic = "force-dynamic";

// Liste des classes de l'année scolaire en cours, dérivée des fiches enfants
// (cf. app/lib/classes.js). Recalculée à chaque appel : elle se corrige
// d'elle-même à mesure que les fiches de l'année sont importées. Peut être
// vide tant que l'import n'a pas eu lieu — l'écran de dépôt propose alors une
// saisie libre en secours.
export async function GET(request) {
  const auth = await requireEnseignant(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const schoolYear = currentSchoolYear();
  const { classes, error } = await listerClassesAnnee(auth.admin, schoolYear);
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ ok: true, schoolYear, classes });
}
