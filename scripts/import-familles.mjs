#!/usr/bin/env node
/**
 * Import admin des familles — SANS jamais envoyer d'invitation.
 *
 * Usage :
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     node scripts/import-familles.mjs chemin/vers/familles.json
 *
 * Ce script ne fait QUE créer les fiches familles/parents/enfants, avec leur
 * e-mail si présent. Il n'invite jamais personne — c'est une garantie du
 * script, pas une option : un import en masse doit toujours pouvoir être
 * relu et vérifié avant qu'un seul e-mail ne parte à une famille. L'envoi
 * des invitations est un second script séparé, à lancer volontairement une
 * fois l'import validé : voir scripts/inviter-familles-importees.mjs.
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
 * Un parent sans e-mail (`email` omis ou null dans le JSON) obtient une
 * fiche sans compte de connexion, comme n'importe quel parent créé sans
 * invitation. Si deux parents de la même famille partagent la même adresse,
 * seul le premier la garde sur sa fiche ; le second est créé sans e-mail
 * (contrainte unique en base) — à compléter à la main si besoin.
 *
 * Écrit scripts/derniers-parents-importes.json : la liste des parents avec
 * e-mail créés par CET import, pour que le script d'invitation sache
 * exactement qui inviter sans toucher aux fiches existantes ailleurs dans
 * la base.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
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

console.log("Cet import ne va envoyer AUCUNE invitation — voir scripts/inviter-familles-importees.mjs pour l'étape suivante.\n");

const families = JSON.parse(readFileSync(filePath, "utf-8"));
const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let familiesCreated = 0;
let parentsCreatedAvecEmail = 0;
let parentsCreatedSansEmail = 0;
let childrenCreated = 0;
const parentsAInviterPlusTard = []; // { id, email, firstName, lastName }

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

  // Un e-mail ne peut appartenir qu'a une seule fiche (contrainte unique en
  // base) : si deux parents de la meme famille partagent une adresse (cas
  // frequent), seul le premier la garde sur sa fiche ; le second est cree
  // "sans compte", sans e-mail, pour ne pas entrer en conflit — a completer
  // manuellement plus tard si besoin.
  const emailsDejaUtilises = new Set();

  for (const parent of fam.parents || []) {
    const emailNormalise = parent.email?.trim().toLowerCase() || null;
    const emailPartage = emailNormalise && emailsDejaUtilises.has(emailNormalise);

    if (emailPartage) {
      console.warn(
        `  Parent ${parent.firstName} ${parent.lastName} : e-mail (${parent.email}) deja utilise par un autre parent de cette famille — fiche creee sans compte, a verifier.`
      );
    }

    const emailRetenu = emailPartage ? null : parent.email?.trim() || null;

    const { data: nouveauParent, error: creationError } = await admin
      .from("parents")
      .insert({
        family_id: family.id,
        first_name: parent.firstName || null,
        last_name: parent.lastName || null,
        email: emailRetenu,
        phone: parent.phone || null,
        role: "parent",
      })
      .select()
      .single();

    if (creationError) {
      console.error(`  Erreur creation fiche parent ${parent.email || "(sans e-mail)"} :`, creationError.message);
      continue;
    }

    if (!emailRetenu) {
      parentsCreatedSansEmail++;
      continue;
    }
    if (emailNormalise) emailsDejaUtilises.add(emailNormalise);

    parentsCreatedAvecEmail++;
    parentsAInviterPlusTard.push({
      id: nouveauParent.id,
      email: emailRetenu,
      firstName: nouveauParent.first_name,
      lastName: nouveauParent.last_name,
    });
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

const sortieAInviter = join(ICI, "derniers-parents-importes.json");
writeFileSync(sortieAInviter, JSON.stringify(parentsAInviterPlusTard, null, 2), "utf8");

console.log("\n--- Résumé ---");
console.log(`Familles créées : ${familiesCreated}`);
console.log(`Parents créés avec e-mail (sans compte pour l'instant) : ${parentsCreatedAvecEmail}`);
console.log(`Parents créés sans e-mail (sans compte) : ${parentsCreatedSansEmail}`);
console.log(`Enfants créés : ${childrenCreated}`);
console.log(`\nListe des parents à inviter écrite dans : ${sortieAInviter}`);
console.log(`\nAucune invitation n'a été envoyée. Vérifie les fiches créées dans le back-office`);
console.log(`(familles, enfants, classes), puis quand tout est bon :`);
console.log(`  node scripts/inviter-familles-importees.mjs`);
