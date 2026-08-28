#!/usr/bin/env node
/**
 * Répare les familles en double créées par l'import du 28 août 2026 : quand
 * un des deux parents existait déjà en base (ex-import du bureau), sa fiche
 * n'a pas pu être recréée (contrainte unique sur l'e-mail), mais la famille
 * ET le conjoint ont quand même été créés à côté — orphelins, sans lien
 * avec la fiche déjà existante.
 *
 * Pour chaque cas : on garde la famille déjà existante (elle peut porter de
 * l'historique réel — adhésions, achats), on lui rattache le conjoint
 * nouvellement créé et les enfants de cette année, puis on supprime la
 * famille orpheline devenue vide.
 *
 * Usage :
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     node scripts/corriger-doublons-import.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("Variables NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY requises.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// [e-mail déjà existant avant l'import, e-mail du conjoint créé aujourd'hui]
const PAIRES = [
  ["dimitri.bouillot@gmail.com", "lauriane.deliry@gmail.com"],
  ["noemie.arnouil@gmail.com", "daubiflo@gmail.com"],
  ["contact.mandrieux@gmail.com", "guillon.sbt@gmail.com"],
  ["juliecaillat@free.fr", "thomas.mathon@gmail.com"],
  ["thomas.ondet@gmail.com", "camillegour@gmail.com"],
];

for (const [emailExistant, emailConjoint] of PAIRES) {
  console.log(`\n--- ${emailExistant} / ${emailConjoint} ---`);

  const { data: ancien, error: e1 } = await admin
    .from("parents")
    .select("id, family_id")
    .eq("email", emailExistant)
    .maybeSingle();
  if (e1 || !ancien) {
    console.error("  Parent existant introuvable :", e1?.message || "aucune ligne");
    continue;
  }

  const { data: conjoint, error: e2 } = await admin
    .from("parents")
    .select("id, family_id")
    .eq("email", emailConjoint)
    .maybeSingle();
  if (e2 || !conjoint) {
    console.error("  Conjoint introuvable :", e2?.message || "aucune ligne");
    continue;
  }

  if (conjoint.family_id === ancien.family_id) {
    console.log("  Déjà sur la même famille, rien à faire.");
    continue;
  }

  const nouvelleFamilleId = conjoint.family_id;
  const ancienneFamilleId = ancien.family_id;

  const { error: e3 } = await admin
    .from("parents")
    .update({ family_id: ancienneFamilleId })
    .eq("id", conjoint.id);
  if (e3) {
    console.error("  Erreur rattachement conjoint :", e3.message);
    continue;
  }

  const { data: enfantsDeplaces, error: e4 } = await admin
    .from("children")
    .update({ family_id: ancienneFamilleId })
    .eq("family_id", nouvelleFamilleId)
    .select("id");
  if (e4) {
    console.error("  Erreur rattachement enfants :", e4.message);
    continue;
  }

  // Filet de sécurité : ne supprimer la famille orpheline que si elle est
  // vraiment vide (aucun parent, aucun enfant restant) après les updates.
  const { count: parentsRestants } = await admin
    .from("parents")
    .select("id", { count: "exact", head: true })
    .eq("family_id", nouvelleFamilleId);
  const { count: enfantsRestants } = await admin
    .from("children")
    .select("id", { count: "exact", head: true })
    .eq("family_id", nouvelleFamilleId);

  if ((parentsRestants || 0) > 0 || (enfantsRestants || 0) > 0) {
    console.error(
      `  ARRÊT — la famille orpheline ${nouvelleFamilleId} n'est pas vide ` +
        `(${parentsRestants} parent(s), ${enfantsRestants} enfant(s) restants) : pas de suppression, à vérifier à la main.`
    );
    continue;
  }

  const { error: e5 } = await admin.from("families").delete().eq("id", nouvelleFamilleId);
  if (e5) {
    console.error("  Erreur suppression famille orpheline :", e5.message);
    continue;
  }

  console.log(
    `  OK — conjoint rattaché, ${enfantsDeplaces?.length || 0} enfant(s) déplacé(s), famille orpheline ${nouvelleFamilleId} supprimée.`
  );
}

console.log("\nTerminé.");
