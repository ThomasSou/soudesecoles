import { NextResponse } from "next/server";
import { createAdminClient } from "../../lib/supabaseServerAdmin";
import { CONTACT_EMAIL, sendMail } from "../../lib/mail";

// Enregistre une demande d'inscription (parent d'élève de l'école Mick
// Micheyl). La demande n'ouvre aucun compte : elle attend une validation
// manuelle du bureau depuis le back-office (/admin/demandes).
export async function POST(request) {
  const { firstName, lastName, email, phone, children, message } =
    await request.json();

  if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    return NextResponse.json(
      { error: "Prénom, nom et e-mail sont obligatoires." },
      { status: 400 }
    );
  }

  const enfants = (children || []).filter(
    (c) => c.firstName?.trim() && c.lastName?.trim()
  );
  if (enfants.length === 0) {
    return NextResponse.json(
      { error: "Merci de renseigner au moins un enfant scolarisé." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Si un compte existe déjà avec cet e-mail, on le signale plutôt que de
  // créer une demande en doublon.
  const { data: existant } = await admin
    .from("parents")
    .select("id")
    .eq("email", email.trim())
    .maybeSingle();

  if (existant) {
    return NextResponse.json(
      {
        error:
          "Un compte existe déjà avec cette adresse e-mail. Utilisez la page de connexion, ou contactez-nous si vous avez oublié votre mot de passe.",
      },
      { status: 409 }
    );
  }

  const { error } = await admin.from("registration_requests").insert({
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    email: email.trim(),
    phone: phone?.trim() || null,
    children: enfants.map((c) => ({
      firstName: c.firstName.trim(),
      lastName: c.lastName.trim(),
      classLevel: c.classLevel?.trim() || null,
    })),
    message: message?.trim() || null,
    status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await sendMail({
    to: CONTACT_EMAIL,
    replyTo: email.trim(),
    subject: "[Site] Nouvelle demande d'inscription famille",
    text: [
      `${firstName.trim()} ${lastName.trim()} <${email.trim()}>`,
      phone?.trim() ? `Téléphone : ${phone.trim()}` : null,
      "",
      "Enfants :",
      ...enfants.map(
        (c) =>
          `  - ${c.firstName.trim()} ${c.lastName.trim()}${
            c.classLevel ? ` (${c.classLevel})` : ""
          }`
      ),
      message?.trim() ? `\nMessage : ${message.trim()}` : null,
      "",
      "À valider dans le back-office : /admin/demandes",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return NextResponse.json({ ok: true });
}
