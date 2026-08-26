import { isSenderConfigured, envoyerEmailTransactionnel } from "./senderMail";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://soumontmerle.netlify.app";

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
      <p style="font-size: 13px; color: #64748b;">Ce lien est à usage unique. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
    </div>
  `;
}

// Envoie une invitation à créer un compte de connexion. Deux circuits :
//
// - Sender configuré (SENDER_API_KEY) : on demande à Supabase de générer le
//   lien d'activation SANS envoyer de mail (generateLink), puis on envoie
//   nous-mêmes l'e-mail via Sender. Contourne la limite d'envoi de Supabase
//   Auth, indispensable pour inviter les 400+ familles.
// - Sender non configuré : comportement inchangé (inviteUserByEmail, envoi
//   par Supabase via le SMTP Infomaniak). C'est le cas tant que Thomas n'a
//   pas créé le compte Sender.
//
// Renvoie la même forme que inviteUserByEmail ({ data: { user }, error })
// pour que les routes appelantes n'aient rien à changer à leur gestion
// d'erreur existante (message "already been registered" compris).
export async function envoyerInvitation(admin, { email, firstName, lastName, parentId, redirectTo }) {
  const lien = redirectTo || `${SITE_URL}/activer-compte`;
  const trimmedEmail = email.trim();

  if (!isSenderConfigured()) {
    return admin.auth.admin.inviteUserByEmail(trimmedEmail, { redirectTo: lien });
  }

  // Compte déjà actif ? On reproduit le message reconnu par les routes
  // appelantes plutôt que de dépendre du libellé d'erreur de generateLink,
  // qui n'est pas garanti identique à celui d'inviteUserByEmail.
  const { data: liste } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existant = (liste?.users || []).find(
    (u) => u.email?.toLowerCase() === trimmedEmail.toLowerCase()
  );

  if (existant?.email_confirmed_at || existant?.confirmed_at) {
    return {
      data: null,
      error: { message: "A user with this email address has already been registered" },
    };
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: trimmedEmail,
    options: { redirectTo: lien },
  });

  if (error) {
    // Repli : generateLink() peut refuser à tort (fausse alerte SPF/DKIM
    // observée en production alors que l'envoi natif ci-dessous fonctionne
    // très bien avec la même config SMTP). On ne bloque jamais une
    // invitation pour ça ; l'e-mail part alors via Supabase/Infomaniak au
    // lieu de Sender (pas de suivi ouverture/clic pour celle-ci, mais elle
    // part).
    return admin.auth.admin.inviteUserByEmail(trimmedEmail, { redirectTo: lien });
  }

  const actionLink = data?.properties?.action_link;
  const user = data?.user || existant;

  try {
    const { messageId } = await envoyerEmailTransactionnel({
      to: trimmedEmail,
      toName: [firstName, lastName].filter(Boolean).join(" ") || undefined,
      subject: "Activez votre espace famille — Sou des Écoles Montmerle-Lurcy",
      html: gabaritInvitation({ firstName, actionLink }),
      text: `${firstName ? `Bonjour ${firstName},` : "Bonjour,"}\n\nActivez votre espace famille du Sou des Écoles en suivant ce lien :\n${actionLink}\n\nCe lien est à usage unique.`,
    });

    await admin.from("invitations").insert({
      parent_id: parentId || null,
      email: trimmedEmail,
      provider_message_id: messageId,
    });
  } catch (sendError) {
    return { data: null, error: sendError };
  }

  return { data: { user }, error: null };
}
