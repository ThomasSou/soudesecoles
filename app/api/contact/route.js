import { NextResponse } from "next/server";
import { createAdminClient } from "../../lib/supabaseServerAdmin";
import { CONTACT_EMAIL, sendMail } from "../../lib/mail";

// Reçoit un message du formulaire de contact (page publique ou espace
// adhérent). Le message est TOUJOURS enregistré en base : c'est la source de
// vérité, consultable dans le back-office. L'e-mail de notification est un
// bonus qui ne part que si le SMTP est configuré — son échec n'empêche
// jamais l'enregistrement.
export async function POST(request) {
  const { name, email, subject, message, context } = await request.json();

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return NextResponse.json(
      { error: "Nom, e-mail et message sont obligatoires." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from("contact_messages").insert({
    name: name.trim(),
    email: email.trim(),
    subject: subject?.trim() || null,
    message: message.trim(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const origine = context === "espace-adherent" ? " (espace adhérent)" : "";
  const mailResult = await sendMail({
    to: CONTACT_EMAIL,
    replyTo: email.trim(),
    subject: `[Site] ${subject?.trim() || "Nouveau message"}${origine}`,
    text: [
      `De : ${name.trim()} <${email.trim()}>`,
      subject?.trim() ? `Sujet : ${subject.trim()}` : null,
      "",
      message.trim(),
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return NextResponse.json({ ok: true, mailSent: mailResult.sent });
}
