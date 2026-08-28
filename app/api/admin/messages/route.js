import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import { CONTACT_EMAIL, sendMail } from "../../../lib/mail";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requirePermission(request, "messages");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.admin
    .from("contact_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ messages: data || [] });
}

function dateLisible(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Message d'origine cité, version texte (préfixe « > » comme un client mail).
function citationTexte(message) {
  const lignes = String(message.message || "")
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  return `--\nLe ${dateLisible(message.created_at)}, ${message.name} a écrit :\n${lignes}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Réponse + message d'origine cité, version HTML. Tous les autres e-mails du
// site partent avec un corps HTML (cf. invitations.js) ; on garde la même
// règle ici pour la délivrabilité.
function corpsHtml(reponse, message) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1e293b;">
      <div style="white-space: pre-wrap;">${escapeHtml(reponse)}</div>
      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">
        Le ${dateLisible(message.created_at)}, ${escapeHtml(message.name)} a écrit :
      </p>
      <blockquote style="margin: 0; padding-left: 12px; border-left: 3px solid #cbd5e1; color: #64748b; white-space: pre-wrap;">${escapeHtml(
        message.message || ""
      )}</blockquote>
    </div>
  `;
}

export async function POST(request) {
  const auth = await requirePermission(request, "messages");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = auth.admin;

  const body = await request.json();
  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "Message introuvable." }, { status: 400 });
  }

  // Envoi d'une réponse depuis le back-office (remplace l'ancien lien mailto:).
  if (typeof body.reply === "string") {
    const reponse = body.reply.trim();
    if (!reponse) {
      return NextResponse.json(
        { error: "La réponse est vide." },
        { status: 400 }
      );
    }

    const { data: message, error: readError } = await admin
      .from("contact_messages")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (readError || !message) {
      return NextResponse.json(
        { error: "Message introuvable." },
        { status: 404 }
      );
    }

    const mail = await sendMail({
      to: message.email,
      replyTo: CONTACT_EMAIL,
      subject: `Re: ${message.subject || "Votre message"}`,
      text: `${reponse}\n\n${citationTexte(message)}`,
      html: corpsHtml(reponse, message),
    });

    if (!mail.sent) {
      // On ne marque pas le message comme répondu si l'e-mail n'est pas parti :
      // le bureau doit pouvoir réessayer.
      return NextResponse.json(
        {
          error:
            "L'e-mail n'a pas pu être envoyé (SMTP indisponible). Réponse non enregistrée, réessayez plus tard.",
        },
        { status: 502 }
      );
    }

    const { error: updateError } = await admin
      .from("contact_messages")
      .update({
        reply_body: reponse,
        replied_at: new Date().toISOString(),
        replied_by: auth.parent.id,
        handled: true,
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, mailSent: true });
  }

  // Bascule « traité / non traité » (comportement historique).
  const { error } = await admin
    .from("contact_messages")
    .update({ handled: Boolean(body.handled) })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
