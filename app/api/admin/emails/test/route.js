import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { CONTACT_EMAIL, isMailConfigured, sendMail } from "../../../../lib/mail";
import { renderBlocksToHtml, renderBlocksToText } from "../../../../lib/emailBlocks";

// Envoie un e-mail de test (à une seule adresse), avec le rendu exact d'un
// destinataire choisi — pour vérifier avant un envoi réel que les champs
// dynamiques (prénom, statut d'adhésion) et la mise en page s'affichent
// correctement dans une vraie boîte de réception.
export async function POST(request) {
  const auth = await requirePermission(request, "emails");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!isMailConfigured()) {
    return NextResponse.json(
      { error: "Envoi non configuré : l'envoi de test n'est pas encore possible (voir avec Thomas)." },
      { status: 503 }
    );
  }

  const { to, subject, contentBlocks, recipient } = await request.json();
  if (!to?.trim() || !subject?.trim() || !(contentBlocks || []).length) {
    return NextResponse.json({ error: "Adresse, sujet et contenu obligatoires." }, { status: 400 });
  }

  const dest = recipient || {};
  const res = await sendMail({
    to: to.trim(),
    subject: `[TEST] ${subject}`,
    text: renderBlocksToText(contentBlocks, { recipient: dest }),
    html: renderBlocksToHtml(contentBlocks, { subject, recipient: dest }),
    replyTo: CONTACT_EMAIL,
  });

  if (!res.sent) {
    return NextResponse.json({ error: "L'envoi a échoué." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
