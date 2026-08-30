// Envoi d'e-mails transactionnels (utilisé par les campagnes du back-office,
// /admin/emails, et par les envois unitaires : invitations, mot de passe
// oublié).
//
// Deux circuits :
// - SMTP classique (nodemailer, ex. Infomaniak) : fiable et rapide sur nos
//   volumes réels (les campagnes partent par vagues étalées, pas 450 d'un
//   coup). C'est le circuit PRINCIPAL des campagnes (option `viaSmtpDabord`).
// - Sender (SENDER_API_KEY) : signé DKIM, taillé pour l'envoi en masse, mais
//   sur le plan gratuit son API répond lentement et refuse par moments de
//   façon imprévisible — ce qui avait provoqué d'abord des doublons, puis des
//   e-mails jamais partis (comptés « en file » à tort). Il reste le circuit
//   principal des envois UNITAIRES (où sa lenteur est sans conséquence) et
//   sert de SECOURS pour les campagnes.
//
// Règle : aucune supposition. Un e-mail n'est compté « parti » que si le
// circuit qui l'a pris le confirme. Si un circuit échoue (time-out, refus,
// erreur), on passe à l'autre. Si les deux échouent : { sent: false }.
//
// Tant qu'aucun des deux n'est configuré, cette fonction ne fait rien et
// renvoie { sent: false, reason: "mail_non_configure" } : les messages
// restent enregistrés en base et consultables dans le back-office.
//
// Variables attendues (SMTP, ex. Infomaniak) :
//   SMTP_HOST=mail.infomaniak.com
//   SMTP_PORT=587
//   SMTP_USER=contact@sou-montmerle.fr
//   SMTP_PASSWORD=...
//   SMTP_FROM="Sou des Écoles <contact@sou-montmerle.fr>"
//   CONTACT_EMAIL=contact@sou-montmerle.fr

import { isSenderConfigured, envoyerEmailTransactionnel } from "./senderMail";

export const CONTACT_EMAIL =
  process.env.CONTACT_EMAIL || "contactsoudesecolesmontmerle@gmail.com";

function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD
  );
}

export function isMailConfigured() {
  return isSenderConfigured() || isSmtpConfigured();
}

async function envoyerViaSender({ to, subject, text, html, replyTo, headers }) {
  await envoyerEmailTransactionnel({ to, subject, text, html, replyTo, headers });
  return { sent: true, via: "sender" };
}

async function envoyerViaSmtp({ to, subject, text, html, replyTo, headers }) {
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    // Bornes : un SMTP lent ne doit pas faire déborder la fonction serveur
    // ni le verrou d'envoi (cf. /api/admin/emails/continuer). Un seul envoi
    // reste donc sous ~18 s au pire.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });

  await transport.sendMail({
    from: process.env.SMTP_FROM || CONTACT_EMAIL,
    to: to || CONTACT_EMAIL,
    replyTo,
    subject,
    text,
    html,
    headers,
  });

  return { sent: true, via: "smtp" };
}

export async function sendMail({
  to,
  subject,
  text,
  html,
  replyTo,
  headers,
  // true pour les campagnes : SMTP en tête, Sender en secours. false (défaut)
  // pour les envois unitaires : Sender en tête, SMTP en secours.
  viaSmtpDabord = false,
}) {
  const msg = { to, subject, text, html, replyTo, headers };
  const smtpDispo = isSmtpConfigured();
  const senderDispo = isSenderConfigured();

  if (!smtpDispo && !senderDispo) {
    return { sent: false, reason: "mail_non_configure" };
  }

  const circuits = viaSmtpDabord
    ? [smtpDispo && envoyerViaSmtp, senderDispo && envoyerViaSender]
    : [senderDispo && envoyerViaSender, smtpDispo && envoyerViaSmtp];

  for (const circuit of circuits) {
    if (!circuit) continue;
    try {
      return await circuit(msg);
    } catch (error) {
      // Aucune supposition : un circuit qui n'aboutit pas (time-out, refus,
      // erreur) ne compte pas comme envoyé. On tente le circuit suivant.
      console.error(`Envoi e-mail : circuit en échec (${error?.message}).`);
    }
  }

  // On ne fait jamais échouer l'action de l'utilisateur à cause de l'e-mail :
  // la donnée est déjà enregistrée en base.
  return { sent: false, reason: "erreur_envoi" };
}
