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
      <p style="font-size: 13px; color: #64748b;">Ce lien est valable 7 jours et à usage unique. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
    </div>
  `;
}

// Envoie une invitation à créer un compte de connexion. Deux circuits :
//
// - Sender configuré (SENDER_API_KEY) : circuit maison de bout en bout.
//   Les fonctions Supabase generateLink()/inviteUserByEmail() se sont
//   révélées peu fiables en production dès qu'elles sont appelées par
//   programmation (clé API) : elles échouent de façon reproductible avec
//   une fausse alerte SPF/DKIM/DMARC, sans qu'aucune trace n'apparaisse
//   dans les journaux Supabase — alors que le même envoi, déclenché à la
//   main depuis le tableau de bord Supabase, réussit systématiquement.
//   On ne dépend donc plus du tout de ces fonctions : le compte est créé
//   ici (createUser, confirmé d'emblée), un jeton maison à usage unique est
//   généré et stocké dans `invitations`, et c'est cette route qui envoie
//   l'e-mail via Sender avec un lien vers /activer-compte?jeton=...
// - Sender non configuré : comportement inchangé (inviteUserByEmail, envoi
//   par Supabase via le SMTP Infomaniak). C'est le cas tant que Thomas n'a
//   pas créé le compte Sender.
//
// Renvoie la même forme que inviteUserByEmail ({ data: { user }, error })
// pour que les routes appelantes n'aient rien à changer à leur gestion
// d'erreur existante (message "already been registered" compris).
export async function envoyerInvitation(admin, { email, firstName, lastName, parentId, redirectTo }) {
  const trimmedEmail = email.trim();

  if (!isSenderConfigured()) {
    const lien = redirectTo || `${SITE_URL}/activer-compte`;
    return admin.auth.admin.inviteUserByEmail(trimmedEmail, { redirectTo: lien });
  }

  const { data: liste, error: listeError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listeError) {
    console.error("[envoyerInvitation] listUsers a échoué :", listeError.message);
    return { data: null, error: listeError };
  }
  const existant = (liste?.users || []).find(
    (u) => u.email?.toLowerCase() === trimmedEmail.toLowerCase()
  );

  if (existant?.email_confirmed_at || existant?.confirmed_at) {
    return {
      data: null,
      error: { message: "A user with this email address has already been registered" },
    };
  }

  let userId = existant?.id;
  if (!userId) {
    const { data: cree, error: creationError } = await admin.auth.admin.createUser({
      email: trimmedEmail,
      email_confirm: true,
    });
    if (creationError) {
      console.error("[envoyerInvitation] createUser a échoué :", creationError.message);
      return { data: null, error: creationError };
    }
    userId = cree.user.id;
  }

  const { data: invitation, error: insertError } = await admin
    .from("invitations")
    .insert({
      parent_id: parentId || null,
      user_id: userId,
      email: trimmedEmail,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("token")
    .single();

  if (insertError) return { data: null, error: insertError };

  const actionLink = `${SITE_URL}/activer-compte?jeton=${invitation.token}`;

  try {
    const { messageId } = await envoyerEmailTransactionnel({
      to: trimmedEmail,
      toName: [firstName, lastName].filter(Boolean).join(" ") || undefined,
      subject: "Activez votre espace famille — Sou des Écoles Montmerle-Lurcy",
      html: gabaritInvitation({ firstName, actionLink }),
      text: `${firstName ? `Bonjour ${firstName},` : "Bonjour,"}\n\nActivez votre espace famille du Sou des Écoles en suivant ce lien :\n${actionLink}\n\nCe lien est valable 7 jours.`,
    });

    await admin.from("invitations").update({ provider_message_id: messageId }).eq("token", invitation.token);
  } catch (sendError) {
    return { data: null, error: sendError };
  }

  return { data: { user: { id: userId, email: trimmedEmail } }, error: null };
}
