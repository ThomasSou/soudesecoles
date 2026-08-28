// Envoi d'e-mails transactionnels (utilisé par les campagnes du back-office,
// /admin/emails).
//
// Deux circuits, comme pour les invitations (cf. invitations.js) :
// - Sender configuré (SENDER_API_KEY) : circuit privilégié. Un hébergement
//   mail classique (Infomaniak) est dimensionné pour une boîte aux lettres,
//   pas pour un envoi en masse à ~450 familles d'un coup — au-delà d'un
//   certain volume dans l'heure, ce genre d'hébergeur peut ralentir ou
//   bloquer l'envoi, sans lien avec notre code. Sender est fait pour ça.
// - Sinon, repli sur le SMTP classique (nodemailer) — utile en secours ou
//   pour un tout petit volume, mais à éviter pour un envoi à toute l'école.
//   Ce repli sert aussi de filet quand Sender est configuré mais renvoie une
//   erreur (compte en validation, quota, clé invalide).
//
// Tant qu'aucun des deux n'est configuré, cette fonction ne fait rien et
// renvoie { sent: false, reason: "mail_non_configure" } : les messages
// restent enregistrés en base et consultables dans le back-office, rien
// n'est perdu.
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

export async function sendMail({ to, subject, text, html, replyTo, headers }) {
  if (isSenderConfigured()) {
    try {
      await envoyerEmailTransactionnel({ to, subject, text, html, replyTo, headers });
      return { sent: true };
    } catch (error) {
      console.error("Envoi e-mail impossible (Sender) :", error?.message);
      // Sender est configuré mais a refusé l'envoi (compte gelé ou en cours de
      // validation, quota atteint, clé invalide...). Plutôt que d'abandonner,
      // on bascule sur le SMTP classique s'il est disponible : mieux vaut un
      // envoi signé DKIM par Sender, mais un envoi par le SMTP vaut mieux que
      // rien. On ne retourne l'échec que si le SMTP n'est pas configuré.
      if (!isSmtpConfigured()) {
        return { sent: false, reason: "erreur_envoi" };
      }
      console.warn("Repli sur le SMTP classique après échec de Sender.");
    }
  }

  if (!isSmtpConfigured()) {
    return { sent: false, reason: "mail_non_configure" };
  }

  try {
    const nodemailer = (await import("nodemailer")).default;
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
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

    return { sent: true };
  } catch (error) {
    // On ne fait jamais échouer l'action de l'utilisateur à cause de l'e-mail :
    // la donnée est déjà enregistrée en base.
    console.error("Envoi e-mail impossible (SMTP) :", error?.message);
    return { sent: false, reason: "erreur_envoi" };
  }
}
