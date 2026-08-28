#!/usr/bin/env node
/**
 * Repère les familles dont plus aucun enfant n'apparaît dans le dernier
 * import (ex. tous les enfants sont partis au collège) — candidates au
 * statut "ancien_parent". Par défaut, se contente d'un RAPPORT : rien n'est
 * modifié en base tant que le drapeau --appliquer n'est pas passé, pour
 * relire la liste avant d'agir (une famille encore active mais simplement
 * absente d'un export imparfait ne doit jamais basculer par erreur).
 *
 * Usage :
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     node scripts/marquer-anciennes-familles.mjs [--annee 2026-2027] [--appliquer]
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("Variables NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY requises.");
  process.exit(1);
}

const appliquer = process.argv.includes("--appliquer");
const idxAnnee = process.argv.indexOf("--annee");
const anneeScolaire =
  (idxAnnee >= 0 && process.argv[idxAnnee + 1]) || process.env.NEXT_PUBLIC_SCHOOL_YEAR || "2026-2027";

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`Année scolaire de référence : ${anneeScolaire}${appliquer ? " — APPLICATION réelle" : " — rapport seulement"}\n`);

const { data: familles, error } = await admin
  .from("families")
  .select("id, status_current_year, children(school_year)")
  .neq("status_current_year", "ancien_parent");

if (error) {
  console.error("Erreur lecture familles :", error.message);
  process.exit(1);
}

const candidates = (familles || []).filter(
  (f) => !f.children?.some((c) => c.school_year === anneeScolaire)
);

console.log(`Familles sans aucun enfant pour ${anneeScolaire} : ${candidates.length} sur ${familles.length}.\n`);

if (candidates.length === 0) {
  console.log("Rien à faire.");
  process.exit(0);
}

if (!appliquer) {
  console.log("Identifiants concernés (relis-les dans le back-office avant d'appliquer) :");
  for (const f of candidates) console.log(`  ${f.id} (statut actuel : ${f.status_current_year})`);
  console.log(`\nRelance avec --appliquer pour marquer ces ${candidates.length} famille(s) "ancien_parent".`);
} else {
  const { error: majError } = await admin
    .from("families")
    .update({ status_current_year: "ancien_parent" })
    .in("id", candidates.map((f) => f.id));
  if (majError) {
    console.error("Erreur mise à jour :", majError.message);
    process.exit(1);
  }
  console.log(`${candidates.length} famille(s) marquée(s) "ancien_parent".`);
}
