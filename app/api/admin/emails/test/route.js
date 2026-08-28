import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { CONTACT_EMAIL, isMailConfigured, sendMail } from "../../../../lib/mail";
import { entetesDesinscription, renderBlocksToHtml, renderBlocksToText } from "../../../../lib/emailBlocks";
import { chargerPlanningEvenement } from "../../../../lib/benevolesPlanning";

export const dynamic = "force-dynamic";

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

  const { to, subject, contentBlocks, recipient, benevolesEvenementId } =
    await request.json();
  if (!to?.trim() || !subject?.trim() || !(contentBlocks || []).length) {
    return NextResponse.json({ error: "Adresse, sujet et contenu obligatoires." }, { status: 400 });
  }

  const dest = recipient || {};
  const planning = benevolesEvenementId
    ? await chargerPlanningEvenement(auth.admin, benevolesEvenementId)
    : null;
  // Pas de préfixe « [TEST] » dans l'objet : un mot entre crochets en
  // majuscules est un déclencheur classique des filtres anti-spam, et on veut
  // que le test reflète exactement l'e-mail qui partira réellement.
  const res = await sendMail({
    to: to.trim(),
    subject,
    text: renderBlocksToText(contentBlocks, { recipient: dest, planning }),
    html: renderBlocksToHtml(contentBlocks, { subject, recipient: dest, planning }),
    replyTo: CONTACT_EMAIL,
    headers: entetesDesinscription(dest, { contactEmail: CONTACT_EMAIL }),
  });

  if (!res.sent) {
    return NextResponse.json({ error: "L'envoi a échoué." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
