import { NextResponse } from "next/server";
import { requireEnseignant } from "../../../lib/enseignantAuth";
import { CONTACT_EMAIL, sendMail } from "../../../lib/mail";

export const dynamic = "force-dynamic";

// Message d'un enseignant / de la direction au bureau. Enregistré dans
// `contact_messages` — la MÊME table que « Messages reçus » du back-office —
// avec from_type = 'enseignant' et l'identité de l'expéditeur (colonnes
// ajoutées par la migration 0033). L'e-mail de notification vers le bureau
// est un bonus : son échec n'empêche pas l'enregistrement.
export async function POST(request) {
  const auth = await requireEnseignant(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const subject = body?.subject?.trim() || null;
  const message = body?.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "Le message est vide." }, { status: 400 });
  }

  const nom = [auth.teacher.first_name, auth.teacher.last_name].filter(Boolean).join(" ") || "Enseignant";

  const { error } = await auth.admin.from("contact_messages").insert({
    name: nom,
    email: auth.teacher.email,
    subject,
    message,
    from_type: "enseignant",
    sender_teacher_id: auth.teacher.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const roleLisible = auth.teacher.role === "direction" ? "Direction" : "Enseignant·e";
  const mailResult = await sendMail({
    to: CONTACT_EMAIL,
    replyTo: auth.teacher.email,
    subject: `[Site] ${subject || "Nouveau message"} (espace enseignant)`,
    text: [
      `De : ${nom} <${auth.teacher.email}> — ${roleLisible}`,
      subject ? `Sujet : ${subject}` : null,
      "",
      message,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return NextResponse.json({ ok: true, mailSent: mailResult.sent });
}
