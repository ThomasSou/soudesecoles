import { isSenderConfigured, envoyerEmailTransactionnel } from "./senderMail";

// Invitation d'un enseignant / de la direction à activer son compte de
// connexion. Décalque app/lib/invitations.js (parents) : même circuit maison
// fiable (création du compte auth confirmé d'emblée + jeton maison à usage
// unique dans `invitations` + e-mail Sender vers /activer-compte?jeton=...),
// même repli sur inviteUserByEmail quand Sender n'est pas configuré.
//
// Seule différence : on rattache la fiche `teachers` (colonne
// invitations.teacher_id, ajoutée par la migration 0034) au lieu de `parents`.
//
// PISTE POUR LE MATIN (cf. docs) : fusionner ce fichier avec invitations.js
// en généralisant le paramètre de rattachement ({ table, id }) plutôt que de
// garder deux copies. Laissé séparé ici pour ne pas toucher au circuit
// parents en pleine campagne de rentrée.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://soumontmerle.netlify.app";

function gabaritInvitationEnseignant({ firstName, actionLink }) {
  const salutation = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
      <p style="font-size: 18px; font-weight: bold; color: #0b3d91;">Sou des Écoles Montmerle-Lurcy</p>
      <p>${salutation}</p>
      <p>Votre espace enseignant est prêt : demandes de financement (devis), factures de prestataires à rembourser, dépôt de RIB, et contact direct avec le bureau.</p>
      <p style="text-align: center; margin: 28px 0;">
        <a href="${actionLink}" style="background: #0b3d91; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: bold;">
          Activer mon espace
        </a>
      </p>
      <p style="font-size: 13px; color: #64748b;">Ce lien est valable 7 jours et à usage unique. Si vous n'êtes pas concerné·e, ignorez ce message.</p>
      <p style="font-size: 13px; color: #64748b;">Le lien ne fonctionne plus ? Rendez-vous sur <a href="${SITE_URL}/mot-de-passe-oublie" style="color: #0b3d91;">${SITE_URL.replace(/^https?:\/\//, "")}/mot-de-passe-oublie</a>.</p>
    </div>
  `;
}

export async function envoyerInvitationEnseignant(admin, { email, firstName, lastName, teacherId, redirectTo }) {
  const trimmedEmail = email.trim();

  // Décision D1 : la personne invitée a peut-être DÉJÀ un compte (parent, ou
  // membre du bureau). Dans ce cas on ne recrée rien et on n'envoie AUCUN
  // e-mail d'activation : on rattache simplement la fiche `teachers` à ce
  // compte existant. La personne se connectera avec son mot de passe habituel
  // et sera aiguillée vers /espace-enseignant par la redirection de rôle.
  const { data: liste, error: listeError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listeError) return { data: null, error: listeError };

  const existant = (liste?.users || []).find(
    (u) => u.email?.toLowerCase() === trimmedEmail.toLowerCase()
  );

  if (existant && (existant.email_confirmed_at || existant.confirmed_at)) {
    if (teacherId) {
      await admin
        .from("teachers")
        .update({ auth_user_id: existant.id, invited_at: new Date().toISOString() })
        .eq("id", teacherId);
    }
    return {
      data: { user: { id: existant.id, email: trimmedEmail }, compteExistant: true },
      error: null,
    };
  }

  if (!isSenderConfigured()) {
    const lien = redirectTo || `${SITE_URL}/activer-compte`;
    const result = await admin.auth.admin.inviteUserByEmail(trimmedEmail, { redirectTo: lien });
    if (!result.error && teacherId && result.data?.user?.id) {
      await admin
        .from("teachers")
        .update({ auth_user_id: result.data.user.id, invited_at: new Date().toISOString() })
        .eq("id", teacherId);
    }
    return result;
  }

  let userId = existant?.id;
  if (!userId) {
    const { data: cree, error: creationError } = await admin.auth.admin.createUser({
      email: trimmedEmail,
      email_confirm: true,
    });
    if (creationError) return { data: null, error: creationError };
    userId = cree.user.id;
  }

  if (teacherId) {
    await admin
      .from("teachers")
      .update({ auth_user_id: userId, invited_at: new Date().toISOString() })
      .eq("id", teacherId);
  }

  const { data: invitation, error: insertError } = await admin
    .from("invitations")
    .insert({
      teacher_id: teacherId || null,
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
      subject: "Activez votre espace enseignant — Sou des Écoles Montmerle-Lurcy",
      html: gabaritInvitationEnseignant({ firstName, actionLink }),
      text: `${firstName ? `Bonjour ${firstName},` : "Bonjour,"}\n\nActivez votre espace enseignant du Sou des Écoles en suivant ce lien :\n${actionLink}\n\nCe lien est valable 7 jours. S'il ne fonctionne plus, rendez-vous sur ${SITE_URL}/mot-de-passe-oublie.`,
    });
    await admin.from("invitations").update({ provider_message_id: messageId }).eq("token", invitation.token);
  } catch (sendError) {
    return { data: null, error: sendError };
  }

  return { data: { user: { id: userId, email: trimmedEmail } }, error: null };
}
