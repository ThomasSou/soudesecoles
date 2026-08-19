#!/usr/bin/env node
/**
 * Import admin des familles + invitation des parents par e-mail.
 *
 * Usage :
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     node scripts/import-familles.mjs chemin/vers/familles.json
 *
 * Format attendu du fichier JSON (tableau de familles) :
 * [
 *   {
 *     "addressLine": "12 rue des Écoles",
 *     "postalCode": "01090",
 *     "city": "Montmerle-sur-Saône",
 *     "schoolYear": "2026-2027",
 *     "parents": [
 *       { "firstName": "Jean", "lastName": "Dupont", "email": "jean.dupont@mail.com", "phone": "0600000000" }
 *     ],
 *     "children": [
 *       { "firstName": "Léo", "lastName": "Dupont", "classLevel": "CE1", "teacherName": "Mme Martin" }
 *     ]
 *   }
 * ]
 *
 * Pour chaque famille :
 *  - crée la ligne `families`
 *  - pour chaque parent : invite l'adresse e-mail via Supabase Auth
 *    (l'utilisateur reçoit un e-mail officiel avec un lien pour définir
 *    son mot de passe), puis crée la ligne `parents` correspondante
 *    (id = id de l'utilisateur invité)
 *  - crée les lignes `children`
 *
 * Si un parent a déjà un compte (email déjà utilisé), le script le signale
 * et passe au suivant sans écraser les données existantes.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://soumontmerle.netlify.app";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const filePath = process.argv[2];

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("Variables NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY requises.");
  process.exit(1);
}
if (!filePath) {
  console.error("Usage: node scripts/import-familles.mjs chemin/vers/familles.json");
  process.exit(1);
}

const families = JSON.parse(readFileSync(filePath, "utf-8"));
const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let familiesCreated = 0;
let parentsInvited = 0;
let parentsSkipped = 0;
let childrenCreated = 0;

for (const fam of families) {
  const { data: family, error: familyError } = await admin
    .from("families")
    .insert({
      address_line: fam.addressLine || null,
      postal_code: fam.postalCode || null,
      city: fam.city || null,
      status_current_year: "non_adherent",
    })
    .select()
    .single();

  if (familyError) {
    console.error(`Erreur creation famille (${fam.parents?.[0]?.lastName || "?"}) :`, familyError.message);
    continue;
  }
  familiesCreated++;

  for (const parent of fam.parents || []) {
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      parent.email,
      { redirectTo: `${SITE_URL}/activer-compte` }
    );

    if (inviteError) {
      console.warn(
        `  Parent ${parent.firstName} ${parent.lastName} (${parent.email}) non invite : ${inviteError.message} — a verifier/rattacher manuellement.`
      );
      parentsSkipped++;
      continue;
    }

    const { error: parentError } = await admin.from("parents").upsert({
      id: invited.user.id,
      family_id: family.id,
      first_name: parent.firstName || null,
      last_name: parent.lastName || null,
      email: parent.email,
      phone: parent.phone || null,
      role: "parent",
    });

    if (parentError) {
      console.error(`  Erreur creation fiche parent ${parent.email} :`, parentError.message);
      continue;
    }
    parentsInvited++;
    console.log(`  Invitation envoyee a ${parent.email}`);
  }

  const childRows = (fam.children || [])
    .filter((c) => c.firstName && c.lastName)
    .map((c) => ({
      family_id: family.id,
      first_name: c.firstName,
      last_name: c.lastName,
      class_level: c.classLevel || null,
      teacher_name: c.teacherName || null,
      school_year: fam.schoolYear || process.env.NEXT_PUBLIC_SCHOOL_YEAR || "2026-2027",
    }));

  if (childRows.length > 0) {
    const { error: childrenError } = await admin.from("children").insert(childRows);
    if (childrenError) {
      console.error("  Erreur creation enfants :", childrenError.message);
    } else {
      childrenCreated += childRows.length;
    }
  }
}

console.log("\n--- Résumé ---");
console.log(`Familles créées : ${familiesCreated}`);
console.log(`Parents invités : ${parentsInvited}`);
console.log(`Parents non invités (déjà existants ou erreur) : ${parentsSkipped}`);
console.log(`Enfants créés : ${childrenCreated}`);
