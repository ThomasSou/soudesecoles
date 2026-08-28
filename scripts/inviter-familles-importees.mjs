#!/usr/bin/env node
/**
 * Deuxième étape, séparée et volontaire, après scripts/import-familles.mjs :
 * envoie l'invitation (compte de connexion) aux parents importés qui ont un
 * e-mail. Ne touche à AUCUNE fiche en dehors de celles créées par le dernier
 * import — voir scripts/derniers-parents-importes.json.
 *
 * Usage :
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     node scripts/inviter-familles-importees.mjs [--voir-seulement] [chemin/vers/liste.json]
 *
 * --voir-seulement : n'envoie rien, affiche juste qui serait invité. À faire
 * en premier, systématiquement, avant le véritable envoi.
 *
 * Sans --voir-seulement : envoie réellement les invitations (via le même
 * circuit que le reste du site : Sender si configuré, sinon Supabase Auth).
 *
 * Avant de lancer sans --voir-seulement, vérifie dans le back-office que les
 * familles/enfants importés sont corrects (bonnes classes, pas de doublons,
 * pas de fratrie mal regroupée) : une fois l'invitation envoyée, le parent a
 * réellement reçu un e-mail, ça ne se annule pas.
 *
 * Si un parent a déjà un compte au moment de l'envoi (créé entre-temps par
 * une autre voie), il est simplement ignoré, pas ré-invité.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Import direct (avec extension) plutôt que via app/lib/invitations.js : ce
// fichier importe lui-même "./senderMail" sans extension, une convention que
// Next.js tolère mais que Node refuse tel quel en dehors du bundler. On
// reproduit donc ici la même logique qu'envoyerInvitation() (voir
// app/lib/invitations.js pour le détail et le pourquoi de chaque branche),
// à tenir synchronisée si ce fichier évolue.
import { isSenderConfigured, envoyerEmailTransactionnel } from "../app/lib/senderMail.js";

const ICI = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sou-montmerle.fr";

const voirSeulement = process.argv.includes("--voir-seulement");
const cheminListe =
  process.argv.slice(2).find((a) => !a.startsWith("--")) || join(ICI, "derniers-parents-importes.json");

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("Variables NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY requises.");
  process.exit(1);
}

let liste;
try {
  liste = JSON.parse(readFileSync(cheminListe, "utf-8"));
} catch {
  console.error(`Fichier introuvable ou illisible : ${cheminListe}`);
  console.error("Lance d'abord scripts/import-familles.mjs, qui écrit ce fichier automatiquement.");
  process.exit(1);
}

if (!Array.isArray(liste) || liste.length === 0) {
  console.log("Rien à inviter (liste vide).");
  process.exit(0);
}

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function gabaritInvitation({ firstName, actionLink }) {
  const salutation = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
      <p style="font-size: 18px; font-weight: bold; color: #0b3d91;">Sou des Écoles Montmerle-Lurcy</p>
      <p>${salutation}</p>
      <p>Votre espace famille est prêt : adhésion en ligne, carte d'adhérent, historique de vos achats.</p>
      <p style="text-align: center; margin: 28px 0;">
        <a href="${actionLink}" style="background: #0b3d91; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: bold;">
          Activer mon espace
        </a>
      </p>
      <p style="font-size: 13px; color: #64748b;">Ce lien est valable 7 jours et à usage unique. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
      <p style="font-size: 13px; color: #64748b;">Le lien ne fonctionne plus ? Rendez-vous directement sur <a href="${SITE_URL}/mot-de-passe-oublie" style="color: #0b3d91;">${SITE_URL.replace(/^https?:\/\//, "")}/mot-de-passe-oublie</a> pour définir votre mot de passe.</p>
    </div>
  `;
}

// Reproduit envoyerInvitation() de app/lib/invitations.js — voir ce fichier
// pour le détail de chaque branche. Renvoie { error } (null si succès).
async function inviter({ email, firstName, lastName, parentId }) {
  const trimmedEmail = email.trim();

  if (!isSenderConfigured()) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(trimmedEmail, {
      redirectTo: `${SITE_URL}/activer-compte`,
    });
    if (!error && data?.user?.id) {
      await admin.from("parents").update({ auth_user_id: data.user.id }).eq("id", parentId);
    }
    return { error };
  }

  const { data: liste, error: listeError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listeError) return { error: listeError };

  const existant = (liste?.users || []).find((u) => u.email?.toLowerCase() === trimmedEmail.toLowerCase());
  if (existant?.email_confirmed_at || existant?.confirmed_at) {
    return { error: { message: "A user with this email address has already been registered" } };
  }

  let userId = existant?.id;
  if (!userId) {
    const { data: cree, error: creationError } = await admin.auth.admin.createUser({
      email: trimmedEmail,
      email_confirm: true,
    });
    if (creationError) return { error: creationError };
    userId = cree.user.id;
  }

  await admin.from("parents").update({ auth_user_id: userId }).eq("id", parentId);

  const { data: invitation, error: insertError } = await admin
    .from("invitations")
    .insert({
      parent_id: parentId,
      user_id: userId,
      email: trimmedEmail,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("token")
    .single();
  if (insertError) return { error: insertError };

  const actionLink = `${SITE_URL}/activer-compte?jeton=${invitation.token}`;

  try {
    const { messageId } = await envoyerEmailTransactionnel({
      to: trimmedEmail,
      toName: [firstName, lastName].filter(Boolean).join(" ") || undefined,
      subject: "Activez votre espace famille — Sou des Écoles Montmerle-Lurcy",
      html: gabaritInvitation({ firstName, actionLink }),
      text: `${firstName ? `Bonjour ${firstName},` : "Bonjour,"}\n\nActivez votre espace famille du Sou des Écoles en suivant ce lien :\n${actionLink}\n\nCe lien est valable 7 jours. S'il ne fonctionne plus, rendez-vous directement sur ${SITE_URL}/mot-de-passe-oublie pour définir votre mot de passe.`,
    });
    await admin.from("invitations").update({ provider_message_id: messageId }).eq("token", invitation.token);
  } catch (sendError) {
    return { error: sendError };
  }

  return { error: null };
}

console.log(
  voirSeulement
    ? `Mode --voir-seulement : aucun envoi. ${liste.length} parent(s) dans la liste.\n`
    : `Envoi réel : ${liste.length} parent(s) dans la liste.\n`
);

let invites = 0;
let dejaUnCompte = 0;
let echecs = 0;

for (const p of liste) {
  // On revérifie l'état actuel en base plutôt que de faire confiance au
  // fichier : la fiche a pu être modifiée entre-temps (ex. invitée à la main
  // depuis le back-office).
  const { data: fiche, error: ficheError } = await admin
    .from("parents")
    .select("id, email, auth_user_id, first_name, last_name")
    .eq("id", p.id)
    .maybeSingle();

  if (ficheError || !fiche) {
    console.warn(`  ${p.firstName} ${p.lastName} (${p.email}) : fiche introuvable, ignoré.`);
    continue;
  }
  if (fiche.auth_user_id) {
    dejaUnCompte++;
    console.log(`  ${fiche.first_name} ${fiche.last_name} (${fiche.email}) : a déjà un compte, ignoré.`);
    continue;
  }
  if (!fiche.email) {
    console.warn(`  ${p.firstName} ${p.lastName} : n'a plus d'e-mail sur sa fiche, ignoré.`);
    continue;
  }

  if (voirSeulement) {
    console.log(`  Serait invité : ${fiche.first_name} ${fiche.last_name} (${fiche.email})`);
    continue;
  }

  const { error: inviteError } = await inviter({
    email: fiche.email,
    firstName: fiche.first_name,
    lastName: fiche.last_name,
    parentId: fiche.id,
  });

  if (inviteError) {
    echecs++;
    console.warn(`  ${fiche.first_name} ${fiche.last_name} (${fiche.email}) : échec — ${inviteError.message}`);
    continue;
  }

  invites++;
  console.log(`  Invitation envoyée à ${fiche.email}`);
}

console.log("\n--- Résumé ---");
if (voirSeulement) {
  console.log(`${liste.length - dejaUnCompte} parent(s) seraient invités, ${dejaUnCompte} ont déjà un compte.`);
  console.log(`\nRelance sans --voir-seulement pour envoyer réellement.`);
} else {
  console.log(`Invitations envoyées : ${invites}`);
  console.log(`Déjà un compte (ignorés) : ${dejaUnCompte}`);
  console.log(`Échecs : ${echecs}`);
}
