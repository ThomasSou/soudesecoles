// Envoi d'e-mails transactionnels.
//
// Tant qu'aucun fournisseur SMTP n'est configuré, cette fonction ne fait rien
// et renvoie { sent: false, reason: "smtp_non_configure" } : les messages
// restent enregistrés en base et consultables dans le back-office, rien
// n'est perdu. Dès que les variables d'environnement SMTP_* sont ajoutées
// sur Netlify, l'envoi s'active automatiquement, sans changement de code.
//
// Variables attendues (ex. Brevo) :
//   SMTP_HOST=smtp-relay.brevo.com
//   SMTP_PORT=587
//   SMTP_USER=...
//   SMTP_PASSWORD=...
//   SMTP_FROM="Sou des Écoles <contactsoudesecolesmontmerle@gmail.com>"
//   CONTACT_EMAIL=contactsoudesecolesmontmerle@gmail.com

export const CONTACT_EMAIL =
  process.env.CONTACT_EMAIL || "contactsoudesecolesmontmerle@gmail.com";

export function isMailConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD
  );
}

export async function sendMail({ to, subject, text, html, replyTo }) {
  if (!isMailConfigured()) {
    return { sent: false, reason: "smtp_non_configure" };
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
    });

    return { sent: true };
  } catch (error) {
    // On ne fait jamais échouer l'action de l'utilisateur à cause de l'e-mail :
    // la donnée est déjà enregistrée en base.
    console.error("Envoi e-mail impossible :", error?.message);
    return { sent: false, reason: "erreur_envoi" };
  }
}
