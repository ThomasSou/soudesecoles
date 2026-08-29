#!/usr/bin/env node
/**
 * Crée des fiches "contact léger" (email_contacts) à partir d'un export CSV
 * de nouvelles inscriptions — pour pouvoir envoyer une campagne e-mail à des
 * personnes qui n'ont pas (encore) de fiche famille complète, sans leur en
 * créer une.
 *
 * Usage :
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     node scripts/importer-contacts-email.mjs chemin/vers/export.csv
 *
 * Pour chaque ligne du CSV :
 *  - e-mail déjà présent dans `parents` (une vraie fiche famille existe déjà)
 *    → ignorée, rien n'est touché.
 *  - e-mail déjà présent dans `email_contacts` → ignorée (déjà connu).
 *  - sinon → nouvelle fiche `email_contacts` (nom, prénom, e-mail, source).
 *
 * Les colonnes du CSV sont repérées par leur intitulé plutôt que par leur
 * position (comme scripts/csv-vers-familles.mjs), en tolérant plusieurs
 * intitulés courants. Le format exact du fichier "nouvelles inscriptions"
 * n'a pas encore été vu par Claude Code au moment d'écrire ce script :
 * ajuster les motifs ci-dessous (COLONNES) si les intitulés réels diffèrent.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const filePath = process.argv[2];

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("Variables NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY requises.");
  process.exit(1);
}
if (!filePath) {
  console.error("Usage: node scripts/importer-contacts-email.mjs chemin/vers/export.csv");
  process.exit(1);
}

const COLONNES = {
  email: /courriel|e-?mail/i,
  prenom: /pr.nom/i,
  nom: /^nom(\s|$)|nom de famille/i,
};

function lireCsv(chemin) {
  // Comme les exports habituels de l'école : Latin-1, séparateur ";".
  const texte = readFileSync(chemin, "latin1");
  return texte
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "" && l.replace(/[";]/g, "").trim() !== "")
    .map((l) => l.split(";").map((c) => c.trim().replace(/^"(.*)"$/s, "$1").trim()));
}

const propre = (s) => (s || "").replace(/\s+/g, " ").trim();

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const lignes = lireCsv(filePath);
const entete = lignes.shift();
const idx = (motif) => entete.findIndex((c) => motif.test(c));
const cEmail = idx(COLONNES.email);
const cPrenom = idx(COLONNES.prenom);
const cNom = idx(COLONNES.nom);

if (cEmail < 0) {
  console.error(
    `Colonne e-mail introuvable dans l'en-tête (${entete.join(" | ")}). ` +
      `Ajuste COLONNES.email dans le script si l'intitulé diffère.`
  );
  process.exit(1);
}

let crees = 0;
let dejaParent = 0;
let dejaContact = 0;
let ignores = 0;

for (const l of lignes) {
  const email = propre(l[cEmail]).toLowerCase();
  if (!email || !email.includes("@")) {
    ignores++;
    continue;
  }
  const firstName = cPrenom >= 0 ? propre(l[cPrenom]) : "";
  const lastName = cNom >= 0 ? propre(l[cNom]) : "";

  const { data: parentExistant } = await admin.from("parents").select("id").eq("email", email).maybeSingle();
  if (parentExistant) {
    dejaParent++;
    continue;
  }

  const { data: contactExistant } = await admin
    .from("email_contacts")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (contactExistant) {
    dejaContact++;
    continue;
  }

  const { error } = await admin.from("email_contacts").insert({
    first_name: firstName || null,
    last_name: lastName || null,
    email,
    source: basename(filePath),
  });
  if (error) {
    console.error(`  Erreur création contact ${email} :`, error.message);
    continue;
  }
  crees++;
}

console.log("\n--- Résumé ---");
console.log(`Contacts créés : ${crees}`);
console.log(`Déjà une fiche parent (ignorés) : ${dejaParent}`);
console.log(`Déjà un contact (ignorés) : ${dejaContact}`);
console.log(`Lignes sans e-mail exploitable (ignorées) : ${ignores}`);
