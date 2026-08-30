import { NextResponse } from "next/server";
import { createAdminClient } from "../../lib/supabaseServerAdmin";
import { envoyerInvitation } from "../../lib/invitations";
import { envoyerInvitationEnseignant } from "../../lib/invitationsEnseignants";
import { envoyerInvitationPartenaire } from "../../lib/partenaires";
import { sendMail } from "../../lib/mail";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sou-montmerle.fr";

// « Mot de passe oublié » côté serveur.
//
// Pourquoi une route serveur plutôt que l'appel client direct à
// supabase.auth.resetPasswordForEmail() : ce dernier n'envoie un e-mail QUE
// si un compte auth.users existe déjà pour l'adresse. Or les familles
// importées (et, plus tard, enseignants / partenaires créés par le bureau)
// ont une fiche `parents` / `teachers` / `partenaires` mais PAS encore de
// compte de connexion — la colonne `auth_user_id` reste nulle tant que
// l'invitation n'a pas été activée (découplage migration 0025). Résultat :
// Supabase ne faisait rien, sans erreur, et la page affichait « c'est
// envoyé » alors que rien ne partait.
//
// Cette route rattrape les deux situations :
//   - Cas A : la fiche a un `auth_user_id` → compte déjà activé → vrai lien
//     de réinitialisation (generateLink type "recovery", envoyé par notre
//     canal e-mail habituel — Sender, repli SMTP).
//   - Cas B : la fiche existe mais sans `auth_user_id` → jamais activée →
//     on relance le circuit d'invitation/activation maison (le même que
//     « renvoyer l'invitation » du back-office) : création du compte + lien
//     « choisir votre mot de passe » vers /activer-compte?jeton=...
//   - Cas C : aucune fiche → on ne fait rien, mais on renvoie la même
//     réponse neutre que A et B pour ne pas révéler quelles adresses
//     existent.
//
// Réponse toujours 200 `{ ok: true }` (sauf corps de requête illisible),
// pour la même raison de non-divulgation.
export async function POST(request) {
  const reponseNeutre = () => NextResponse.json({ ok: true });

  const body = await request.json().catch(() => null);
  const email = (typeof body?.email === "string" ? body.email : "").trim().toLowerCase();

  // Rien d'exploitable : on répond neutre sans rien tenter.
  if (!email || !email.includes("@")) return reponseNeutre();

  const admin = createAdminClient();

  // Les trois répertoires qui portent un compte de connexion. teachers et
  // partenaires sont interrogés en best-effort : sur un environnement où les
  // migrations 0034 / 0035 ne seraient pas encore appliquées, l'absence de
  // table ou de colonne ne doit pas casser la route.
  const parent = await chercherFiche(
    admin,
    "parents",
    "id, email, first_name, last_name, auth_user_id",
    email
  );
  const teacher = await chercherFiche(
    admin,
    "teachers",
    "id, email, first_name, last_name, auth_user_id",
    email
  );
  const partenaire = await chercherFiche(
    admin,
    "partenaires",
    "id, email, nom, auth_user_id",
    email
  );

  const fiches = [parent, teacher, partenaire].filter(Boolean);

  // Cas C — aucune fiche connue.
  if (fiches.length === 0) return reponseNeutre();

  // Cas A — au moins une fiche renvoie vers un compte déjà activé.
  const dejaActivee = fiches.find((f) => f.auth_user_id);
  if (dejaActivee) {
    await envoyerLienReset(admin, email, nomLisible(dejaActivee));
    return reponseNeutre();
  }

  // Cas B — fiche(s) trouvée(s) mais aucun compte activé : on relance le
  // circuit d'invitation adapté au type de fiche. On garde l'ordre
  // bureau/enseignant > partenaire > parent uniquement pour choisir UN
  // circuit ; n'importe lequel aboutit à un lien de définition de mot de
  // passe, et la redirection par rôle après connexion fait le reste.
  try {
    let resultat = null;
    if (teacher) {
      resultat = await envoyerInvitationEnseignant(admin, {
        email,
        firstName: teacher.first_name,
        lastName: teacher.last_name,
        teacherId: teacher.id,
      });
    } else if (partenaire) {
      resultat = await envoyerInvitationPartenaire(admin, {
        email,
        nom: partenaire.nom,
        partenaireId: partenaire.id,
      });
    } else if (parent) {
      resultat = await envoyerInvitation(admin, {
        email,
        firstName: parent.first_name,
        lastName: parent.last_name,
        parentId: parent.id,
      });
    }

    // La fiche n'était pas reliée, mais un compte auth confirmé existe déjà
    // pour cette adresse : le circuit d'invitation refuse alors avec
    // « already been registered ». On bascule sur un vrai reset.
    if (resultat?.error && /already been registered/i.test(resultat.error.message || "")) {
      await envoyerLienReset(admin, email, nomLisible(teacher || partenaire || parent));
    } else if (resultat?.error) {
      console.error(
        "[mot-de-passe-oublie] circuit d'invitation en échec :",
        resultat.error.message
      );
    }
  } catch (e) {
    // On ne fait jamais échouer la demande de l'utilisateur : la réponse
    // reste neutre, l'incident est tracé côté serveur.
    console.error("[mot-de-passe-oublie] Cas B a levé :", e?.message);
  }

  return reponseNeutre();
}

// Lecture best-effort d'une fiche par e-mail (insensible à la casse). Renvoie
// la ligne ou null ; ne jette jamais.
async function chercherFiche(admin, table, colonnes, email) {
  try {
    const { data, error } = await admin
      .from(table)
      .select(colonnes)
      .ilike("email", email)
      .maybeSingle();
    if (error) {
      console.error(`[mot-de-passe-oublie] lecture ${table} :`, error.message);
      return null;
    }
    return data || null;
  } catch (e) {
    console.error(`[mot-de-passe-oublie] lecture ${table} a levé :`, e?.message);
    return null;
  }
}

function nomLisible(fiche) {
  if (!fiche) return "";
  const complet = [fiche.first_name, fiche.last_name].filter(Boolean).join(" ");
  return complet || fiche.nom || "";
}

// Cas A : vrai lien de réinitialisation pour un compte déjà activé. On génère
// le lien nous-mêmes (generateLink) puis on l'envoie via notre canal habituel
// (sendMail = Sender, repli SMTP) plutôt que de laisser Supabase l'expédier :
// c'est le même choix que pour les invitations (cf. app/lib/invitations.js),
// pour la fiabilité de l'acheminement. Le lien retombe sur /activer-compte,
// dont la branche « pas de jeton » sait établir la session depuis les jetons
// que Supabase ajoute au fragment d'URL puis proposer le nouveau mot de passe.
async function envoyerLienReset(admin, email, nom) {
  let lien;
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${SITE_URL}/activer-compte` },
    });
    if (error || !data?.properties?.action_link) {
      console.error(
        "[mot-de-passe-oublie] generateLink recovery en échec :",
        error?.message || "action_link absent"
      );
      return;
    }
    lien = data.properties.action_link;
  } catch (e) {
    console.error("[mot-de-passe-oublie] generateLink recovery a levé :", e?.message);
    return;
  }

  const salutation = nom ? `Bonjour ${nom},` : "Bonjour,";
  await sendMail({
    to: email,
    subject: "Réinitialisation de votre mot de passe — Sou des Écoles Montmerle-Lurcy",
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
      <p style="font-size: 18px; font-weight: bold; color: #0b3d91;">Sou des Écoles Montmerle-Lurcy</p>
      <p>${salutation}</p>
      <p>Vous avez demandé à réinitialiser le mot de passe de votre espace. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.</p>
      <p style="text-align: center; margin: 28px 0;">
        <a href="${lien}" style="background: #0b3d91; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: bold;">
          Choisir un nouveau mot de passe
        </a>
      </p>
      <p style="font-size: 13px; color: #64748b;">Ce lien est valable une heure et à usage unique. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.</p>
    </div>
  `,
    text: `${salutation}\n\nVous avez demandé à réinitialiser le mot de passe de votre espace du Sou des Écoles. Choisissez un nouveau mot de passe en suivant ce lien :\n${lien}\n\nCe lien est valable une heure et à usage unique. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.`,
  });
}
