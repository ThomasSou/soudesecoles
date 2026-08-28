#!/usr/bin/env node
/**
 * Import (ou ré-import) admin des familles — SANS jamais envoyer
 * d'invitation. Peut être relancé autant de fois que nécessaire, y compris
 * d'une année sur l'autre : chaque parent est retrouvé par son e-mail
 * (source de vérité, unique en base) et sa fiche/famille existante est
 * réutilisée et mise à jour, jamais dupliquée.
 *
 * Usage :
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     node scripts/import-familles.mjs chemin/vers/familles.json
 *
 * Ce script ne fait QUE créer/mettre à jour les fiches familles/parents/
 * enfants. Il n'invite jamais personne — c'est une garantie du script, pas
 * une option : un import en masse doit toujours pouvoir être relu et
 * vérifié avant qu'un seul e-mail ne parte à une famille. L'envoi des
 * invitations est un second script séparé, à lancer volontairement une fois
 * l'import validé : voir scripts/inviter-familles-importees.mjs.
 *
 * Comment le rapprochement se fait, pour chaque famille du fichier :
 *  - Famille : on prend la family_id du premier parent du fichier dont
 *    l'e-mail existe déjà en base. Si aucun des parents n'a de fiche
 *    existante, une nouvelle famille est créée. L'adresse est mise à jour
 *    UNIQUEMENT si elle est vide en base (on n'écrase jamais une adresse
 *    déjà connue par une adresse absente du nouvel export).
 *  - Parent AVEC e-mail : fiche retrouvée par e-mail → nom/téléphone mis à
 *    jour si le nouvel export apporte une valeur, et rattachée à la bonne
 *    famille si besoin (ex. un parent isolé l'an dernier a rejoint la
 *    famille cette année). Sinon, nouvelle fiche créée.
 *  - Parent SANS e-mail : retrouvé par (famille + nom + prénom) ; sinon
 *    créé. Comme il n'y a pas d'identifiant fiable, deux parents sans
 *    e-mail au nom très proche pourraient ne pas se reconnaître d'une année
 *    sur l'autre — cas rare, à corriger à la main si ça arrive.
 *  - Enfant : les enfants sont déjà historisés par année scolaire
 *    (`children.school_year`) — un enfant déjà connu POUR CETTE ANNÉE
 *    (famille + nom + prénom + année) voit juste sa classe mise à jour ;
 *    sinon une nouvelle ligne est créée pour cette année. Les lignes des
 *    années précédentes ne sont jamais touchées : l'historique reste
 *    intact même si l'enfant a quitté l'école (passage en 6ᵉ...).
 *
 * Familles non retrouvées dans ce nouvel import (aucun enfant scolarisé
 * cette année) : PAS marquées automatiquement "ancien parent" — ce script
 * ne touche qu'aux familles présentes dans le fichier. Utilise
 * scripts/marquer-anciennes-familles.mjs séparément si besoin, après avoir
 * relu la liste des familles concernées.
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
 * Écrit scripts/derniers-parents-importes.json : la liste des parents avec
 * e-mail ENCORE SANS COMPTE (nouveaux ou pas encore invités) après CET
 * import, pour que le script d'invitation sache qui inviter — les parents
 * qui avaient déjà un compte ne sont jamais réinvités.
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

const stats = {
  famillesCreees: 0,
  famillesReutilisees: 0,
  parentsCrees: 0,
  parentsMisAJour: 0,
  parentsRerattaches: 0,
  enfantsCrees: 0,
  enfantsMisAJour: 0,
  erreurs: 0,
};
const parentsAInviterPlusTard = []; // { id, email, firstName, lastName }

for (const fam of families) {
  const nomFamille = fam.children?.[0]?.lastName || fam.parents?.[0]?.lastName || "?";

  // --- 1. Retrouver ou créer la famille -------------------------------
  let familyId = null;
  for (const parent of fam.parents || []) {
    const email = parent.email?.trim().toLowerCase();
    if (!email) continue;
    const { data: existant } = await admin.from("parents").select("family_id").eq("email", email).maybeSingle();
    if (existant?.family_id) {
      familyId = existant.family_id;
      break;
    }
  }

  if (familyId) {
    stats.famillesReutilisees++;
    // On ne remplit l'adresse que si elle manque encore — jamais d'écrasement.
    const { data: familleActuelle } = await admin
      .from("families")
      .select("address_line, postal_code, city")
      .eq("id", familyId)
      .maybeSingle();
    if (familleActuelle && !familleActuelle.address_line && fam.addressLine) {
      await admin
        .from("families")
        .update({
          address_line: fam.addressLine || null,
          postal_code: fam.postalCode || null,
          city: fam.city || null,
        })
        .eq("id", familyId);
    }
  } else {
    const { data: nouvelleFamille, error: familyError } = await admin
      .from("families")
      .insert({
        address_line: fam.addressLine || null,
        postal_code: fam.postalCode || null,
        city: fam.city || null,
        status_current_year: "non_adherent",
      })
      .select("id")
      .single();
    if (familyError) {
      console.error(`Erreur creation famille (${nomFamille}) :`, familyError.message);
      stats.erreurs++;
      continue;
    }
    familyId = nouvelleFamille.id;
    stats.famillesCreees++;
  }

  // --- 2. Retrouver ou créer/mettre à jour chaque parent ---------------
  const emailsDejaUtilisesDansCetteFamille = new Set();

  for (const parent of fam.parents || []) {
    const emailNormalise = parent.email?.trim().toLowerCase() || null;
    const emailPartage = emailNormalise && emailsDejaUtilisesDansCetteFamille.has(emailNormalise);
    if (emailPartage) {
      console.warn(
        `  Parent ${parent.firstName} ${parent.lastName} : e-mail (${parent.email}) deja utilise par un autre parent de cette famille dans ce fichier — fiche sans e-mail, a verifier.`
      );
    }
    const emailRetenu = emailPartage ? null : emailNormalise;

    let existant = null;
    if (emailRetenu) {
      const { data } = await admin
        .from("parents")
        .select("id, family_id, first_name, last_name, phone")
        .eq("email", emailRetenu)
        .maybeSingle();
      existant = data;
    } else {
      // Sans e-mail : seul le nom, au sein de la même famille, permet de
      // retrouver une fiche déjà créée lors d'un import précédent.
      const { data } = await admin
        .from("parents")
        .select("id, family_id, first_name, last_name, phone")
        .eq("family_id", familyId)
        .is("email", null)
        .eq("first_name", parent.firstName || null)
        .eq("last_name", parent.lastName || null)
        .maybeSingle();
      existant = data;
    }

    if (existant) {
      const patch = {};
      if (parent.firstName && parent.firstName !== existant.first_name) patch.first_name = parent.firstName;
      if (parent.lastName && parent.lastName !== existant.last_name) patch.last_name = parent.lastName;
      if (parent.phone && parent.phone !== existant.phone) patch.phone = parent.phone;
      if (existant.family_id !== familyId) {
        patch.family_id = familyId;
        stats.parentsRerattaches++;
      }
      if (Object.keys(patch).length > 0) {
        const { error: majError } = await admin.from("parents").update(patch).eq("id", existant.id);
        if (majError) {
          console.error(`  Erreur mise a jour parent ${parent.email || parent.lastName} :`, majError.message);
          stats.erreurs++;
          continue;
        }
        stats.parentsMisAJour++;
      }
      if (emailRetenu) emailsDejaUtilisesDansCetteFamille.add(emailRetenu);
      continue;
    }

    const { data: nouveauParent, error: creationError } = await admin
      .from("parents")
      .insert({
        family_id: familyId,
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
      stats.erreurs++;
      continue;
    }

    stats.parentsCrees++;
    if (emailRetenu) {
      emailsDejaUtilisesDansCetteFamille.add(emailRetenu);
      parentsAInviterPlusTard.push({
        id: nouveauParent.id,
        email: emailRetenu,
        firstName: nouveauParent.first_name,
        lastName: nouveauParent.last_name,
      });
    }
  }

  // --- 3. Retrouver ou créer/mettre à jour chaque enfant, pour l'année --
  const anneeScolaire = fam.schoolYear || process.env.NEXT_PUBLIC_SCHOOL_YEAR || "2026-2027";

  for (const enfant of fam.children || []) {
    if (!enfant.firstName || !enfant.lastName) continue;

    const { data: existant } = await admin
      .from("children")
      .select("id, class_level")
      .eq("family_id", familyId)
      .eq("first_name", enfant.firstName)
      .eq("last_name", enfant.lastName)
      .eq("school_year", anneeScolaire)
      .maybeSingle();

    if (existant) {
      if (enfant.classLevel && enfant.classLevel !== existant.class_level) {
        const { error: majError } = await admin
          .from("children")
          .update({ class_level: enfant.classLevel })
          .eq("id", existant.id);
        if (majError) {
          console.error(`  Erreur mise a jour classe ${enfant.firstName} ${enfant.lastName} :`, majError.message);
          stats.erreurs++;
          continue;
        }
        stats.enfantsMisAJour++;
      }
      continue;
    }

    const { error: creationError } = await admin.from("children").insert({
      family_id: familyId,
      first_name: enfant.firstName,
      last_name: enfant.lastName,
      class_level: enfant.classLevel || null,
      school_year: anneeScolaire,
    });
    if (creationError) {
      console.error(`  Erreur creation enfant ${enfant.firstName} ${enfant.lastName} :`, creationError.message);
      stats.erreurs++;
      continue;
    }
    stats.enfantsCrees++;
  }
}

const sortieAInviter = join(ICI, "derniers-parents-importes.json");
writeFileSync(sortieAInviter, JSON.stringify(parentsAInviterPlusTard, null, 2), "utf8");

console.log("\n--- Résumé ---");
console.log(`Familles créées : ${stats.famillesCreees}`);
console.log(`Familles déjà existantes réutilisées : ${stats.famillesReutilisees}`);
console.log(`Parents créés : ${stats.parentsCrees}`);
console.log(`Parents déjà existants mis à jour : ${stats.parentsMisAJour}`);
console.log(`  dont rattachés à une famille différente de la précédente : ${stats.parentsRerattaches}`);
console.log(`Enfants créés : ${stats.enfantsCrees}`);
console.log(`Enfants déjà existants mis à jour (classe) : ${stats.enfantsMisAJour}`);
if (stats.erreurs > 0) console.log(`Erreurs rencontrées (voir ci-dessus) : ${stats.erreurs}`);
console.log(`\nListe des parents (nouveaux) à inviter écrite dans : ${sortieAInviter}`);
console.log(`\nAucune invitation n'a été envoyée. Vérifie les fiches créées/mises à jour dans le back-office`);
console.log(`(familles, enfants, classes), puis quand tout est bon :`);
console.log(`  node scripts/inviter-familles-importees.mjs`);
