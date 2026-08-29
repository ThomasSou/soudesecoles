import { NextResponse } from "next/server";
import { CONTACT_EMAIL, sendMail } from "../../../lib/mail";
import { resolvePartenaireSession } from "../../../lib/partenaires";

export const dynamic = "force-dynamic";

// Formulaire de contact de l'espace partenaire. Le message atterrit dans le
// MÊME "Messages reçus" du back-office (table contact_messages), mais avec
// source = 'partenaire' et l'identité de l'expéditeur, pour que le bureau
// distingue d'un coup d'œil un message de partenaire d'un message public ou
// de parent. Le nom et l'e-mail viennent du compte connecté, pas d'un champ
// libre.
export async function POST(request) {
  const session = await resolvePartenaireSession(request);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });
  const { admin, partenaire, user } = session;

  const body = await request.json().catch(() => null);
  const message = body?.message?.trim();
  const subject = body?.subject?.trim() || null;
  if (!message) {
    return NextResponse.json({ error: "Le message est obligatoire." }, { status: 400 });
  }

  const email = partenaire.email || user.email;
  const { error } = await admin.from("contact_messages").insert({
    name: partenaire.nom,
    email,
    subject,
    message,
    source: "partenaire",
    auteur_partenaire_id: partenaire.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mailResult = await sendMail({
    to: CONTACT_EMAIL,
    replyTo: email,
    subject: `[Site] ${subject || "Nouveau message"} (partenaire)`,
    text: [`De : ${partenaire.nom} <${email}> — partenaire`, subject ? `Sujet : ${subject}` : null, "", message]
      .filter(Boolean)
      .join("\n"),
  });

  return NextResponse.json({ ok: true, mailSent: mailResult.sent });
}
