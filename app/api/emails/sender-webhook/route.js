import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

// Reçoit les évènements du prestataire Sender (livré, ouvert, cliqué,
// rebond...) pour les invitations envoyées via app/lib/invitations.js.
//
// Le nom exact des champs du webhook Sender n'a pas pu être vérifié tant
// que le compte n'existe pas (documentation publique incomplète sur ce
// point). Ce code teste donc plusieurs noms de champs plausibles, ET
// conserve systématiquement le payload brut dans invitations.raw_events :
// rien n'est perdu si le format réel diffère, il suffira d'ajuster
// analyserEvenement ci-dessous après avoir vu un vrai payload (URL de test
// disponible dans le tableau de bord Sender, section Webhooks).
//
// Variable optionnelle : SENDER_WEBHOOK_SECRET (vérifié via ?secret=... dans
// l'URL du webhook configurée côté Sender). Tant qu'elle n'est pas définie,
// aucune vérification n'est faite.

function analyserEvenement(payload) {
  const type = String(
    payload?.type || payload?.event || payload?.event_type || ""
  ).toLowerCase();

  const email =
    payload?.email ||
    payload?.recipient ||
    payload?.to ||
    payload?.data?.email ||
    payload?.data?.recipient ||
    null;

  const messageId =
    payload?.message_id ||
    payload?.id ||
    payload?.data?.message_id ||
    payload?.data?.id ||
    null;

  let colonne = null;
  if (type.includes("click")) colonne = "clicked_at";
  else if (type.includes("open")) colonne = "opened_at";
  else if (type.includes("bounce")) colonne = "bounced_at";
  else if (type.includes("deliver")) colonne = "delivered_at";

  return { type, email, messageId, colonne };
}

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const secretAttendu = process.env.SENDER_WEBHOOK_SECRET;
  if (secretAttendu && searchParams.get("secret") !== secretAttendu) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Payload invalide." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { type, email, messageId, colonne } = analyserEvenement(payload);

  let requete = admin.from("invitations").select("id, raw_events").limit(1);
  if (messageId) {
    requete = requete.eq("provider_message_id", messageId);
  } else if (email) {
    requete = requete.eq("email", email).order("sent_at", { ascending: false });
  } else {
    console.warn("Webhook Sender reçu sans email ni message_id identifiable :", type);
    return NextResponse.json({ ok: true });
  }

  const { data: correspondance } = await requete.maybeSingle();

  if (!correspondance) {
    console.warn(`Webhook Sender (${type}) : aucune invitation correspondante pour`, {
      email,
      messageId,
    });
    return NextResponse.json({ ok: true });
  }

  const patch = {
    raw_events: [...(correspondance.raw_events || []), { received_at: new Date().toISOString(), payload }],
  };
  if (colonne) patch[colonne] = new Date().toISOString();

  await admin.from("invitations").update(patch).eq("id", correspondance.id);

  return NextResponse.json({ ok: true });
}
