import { createAdminClient } from "./supabaseServerAdmin";
import { isSenderConfigured, envoyerEmailTransactionnel } from "./senderMail";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://sou-montmerle.fr";

// --- Session partenaire ----------------------------------------------------
// L'espace partenaire réutilise l'authentification Supabase (même compte
// e-mail/mot de passe que les familles). On retrouve le partenaire par
// `auth_user_id`, comme on retrouve un parent par le sien. Ne jamais faire
// confiance à un `partenaireId` envoyé par le client : toujours le déduire
// du jeton.
export async function resolvePartenaireSession(request) {
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return { error: "Non authentifié.", status: 401 };

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData?.user) return { error: "Session invalide.", status: 401 };

  const { data: partenaire } = await admin
    .from("partenaires")
    .select("*")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (!partenaire) return { error: "Accès réservé aux partenaires du Sou des Écoles.", status: 403 };
  if (!partenaire.active) return { error: "Ce compte partenaire est désactivé.", status: 403 };

  return { admin, partenaire, user: userData.user };
}

// --- Période d'adhésion --------------------------------------------------
// Un partenaire est "à jour" si aujourd'hui tombe dans une période non
// annulée. Renvoie la période courante (ou null) et un booléen.
export function statutPeriodePartenaire(periodes) {
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const courante = (periodes || []).find(
    (p) => !p.annulee && p.debut <= aujourdHui && p.fin >= aujourdHui
  );
  return { aJour: Boolean(courante), periodeCourante: courante || null };
}

// --- Historique des offres d'avantages --------------------------------
// Best-effort : on n'échoue jamais l'action de l'utilisateur si l'écriture
// de l'historique rate.
export async function tracerEvenementAvantage(admin, { avantage, action, partenaireId, auteur }) {
  try {
    await admin.from("avantage_evenements").insert({
      avantage_id: avantage.id,
      partenaire_id: partenaireId || avantage.partenaire_id || null,
      action,
      auteur: auteur || null,
      details: {
        label: avantage.label,
        description: avantage.description || null,
        limite: avantage.limite,
        requiert_adhesion: avantage.requiert_adhesion,
        active: avantage.active,
      },
    });
  } catch (e) {
    console.error("[tracerEvenementAvantage] échec non bloquant :", e?.message);
  }
}

// --- Invitation à activer l'espace partenaire -------------------------
// Copie assumée de app/lib/invitations.js (circuit familles) : le
// commentaire de fond y explique pourquoi generateLink()/inviteUserByEmail()
// ne sont pas fiables en appel programmatique et pourquoi on passe par un
// jeton maison + Sender quand il est configuré. Seule différence ici : la
// cible est un `partenaire`, le lien renvoie vers /activer-compte avec
// ?espace=partenaire, et le texte parle de l'espace partenaire.
function gabaritInvitationPartenaire({ nom, actionLink }) {
  const salutation = nom ? `Bonjour ${nom},` : "Bonjour,";
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
      <p style="font-size: 18px; font-weight: bold; color: #0b3d91;">Sou des Écoles Montmerle-Lurcy</p>
      <p>${salutation}</p>
      <p>Votre espace partenaire est prêt : suivi de vos versements, période de partenariat, avantages offerts aux familles adhérentes, documents partagés par le bureau.</p>
      <p style="text-align: center; margin: 28px 0;">
        <a href="${actionLink}" style="background: #0b3d91; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: bold;">
          Activer mon espace partenaire
        </a>
      </p>
      <p style="font-size: 13px; color: #64748b;">Ce lien est valable 7 jours et à usage unique. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
      <p style="font-size: 13px; color: #64748b;">Le lien ne fonctionne plus ? Rendez-vous sur <a href="${SITE_URL}/mot-de-passe-oublie" style="color: #0b3d91;">${SITE_URL.replace(/^https?:\/\//, "")}/mot-de-passe-oublie</a> pour définir votre mot de passe.</p>
    </div>
  `;
}

export async function envoyerInvitationPartenaire(admin, { email, nom, partenaireId }) {
  const trimmedEmail = (email || "").trim();
  if (!trimmedEmail) return { data: null, error: { message: "Adresse e-mail manquante." } };

  const redirectTo = `${SITE_URL}/activer-compte?espace=partenaire`;

  if (!isSenderConfigured()) {
    const result = await admin.auth.admin.inviteUserByEmail(trimmedEmail, { redirectTo });
    if (!result.error && partenaireId && result.data?.user?.id) {
      await admin.from("partenaires").update({ auth_user_id: result.data.user.id }).eq("id", partenaireId);
    }
    return result;
  }

  const { data: liste, error: listeError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listeError) return { data: null, error: listeError };

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
    if (creationError) return { data: null, error: creationError };
    userId = cree.user.id;
  }

  if (partenaireId) {
    await admin.from("partenaires").update({ auth_user_id: userId }).eq("id", partenaireId);
  }

  const { data: invitation, error: insertError } = await admin
    .from("invitations")
    .insert({
      partenaire_id: partenaireId || null,
      user_id: userId,
      email: trimmedEmail,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("token")
    .single();

  if (insertError) return { data: null, error: insertError };

  const actionLink = `${SITE_URL}/activer-compte?espace=partenaire&jeton=${invitation.token}`;

  try {
    const { messageId } = await envoyerEmailTransactionnel({
      to: trimmedEmail,
      toName: nom || undefined,
      subject: "Activez votre espace partenaire — Sou des Écoles Montmerle-Lurcy",
      html: gabaritInvitationPartenaire({ nom, actionLink }),
      text: `${nom ? `Bonjour ${nom},` : "Bonjour,"}\n\nActivez votre espace partenaire du Sou des Écoles en suivant ce lien :\n${actionLink}\n\nCe lien est valable 7 jours. S'il ne fonctionne plus, rendez-vous sur ${SITE_URL}/mot-de-passe-oublie pour définir votre mot de passe.`,
    });
    await admin.from("invitations").update({ provider_message_id: messageId }).eq("token", invitation.token);
  } catch (sendError) {
    return { data: null, error: sendError };
  }

  return { data: { user: { id: userId, email: trimmedEmail } }, error: null };
}
