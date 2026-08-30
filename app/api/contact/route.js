import { NextResponse } from "next/server";
import { createAdminClient } from "../../lib/supabaseServerAdmin";
import { CONTACT_EMAIL, sendMail } from "../../lib/mail";

export const dynamic = "force-dynamic";

// Reçoit un message du formulaire de contact (page publique ou espace
// adhérent). Le message est TOUJOURS enregistré en base : c'est la source de
// vérité, consultable dans le back-office. L'e-mail de notification est un
// bonus qui ne part que si le SMTP est configuré — son échec n'empêche
// jamais l'enregistrement.
//
// Authentification OPTIONNELLE : si l'appel porte un jeton Supabase valide
// rattaché à un parent, le message est marqué from_type='parent' +
// sender_parent_id (badge « Parent » dans « Messages reçus »). Sans jeton, ou
// jeton invalide, le comportement public est strictement inchangé (aucune
// colonne d'origine écrite : reste compatible même si 0040 n'est pas encore
// appliquée).
export async function POST(request) {
  const { name, email, subject, message, context } = await request.json();

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return NextResponse.json(
      { error: "Nom, e-mail et message sont obligatoires." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Résolution best-effort du parent connecté à partir du jeton porteur.
  let parentId = null;
  const accessToken = (request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (accessToken) {
    const { data: userData } = await admin.auth.getUser(accessToken);
    if (userData?.user) {
      const { data: parent } = await admin
        .from("parents")
        .select("id")
        .eq("auth_user_id", userData.user.id)
        .maybeSingle();
      if (parent) parentId = parent.id;
    }
  }

  const ligne = {
    name: name.trim(),
    email: email.trim(),
    subject: subject?.trim() || null,
    message: message.trim(),
  };
  if (parentId) {
    ligne.from_type = "parent";
    ligne.sender_parent_id = parentId;
  }

  const { error } = await admin.from("contact_messages").insert(ligne);

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
