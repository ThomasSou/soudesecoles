import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { isMailConfigured } from "../../../../lib/mail";
import { envoyerVague } from "../../../../lib/emailCampagne";

export const dynamic = "force-dynamic";

// Envoie la vague suivante d'une campagne déjà démarrée (cf.
// app/api/admin/emails). Le front appelle cette route en boucle, avec une
// courte pause entre chaque vague, jusqu'à `done: true`. Idempotent : une
// campagne déjà terminée renvoie simplement done avec son compteur final.
export async function POST(request) {
  const auth = await requirePermission(request, "emails");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { campaignId } = await request.json();
  if (!campaignId) {
    return NextResponse.json({ error: "Campagne manquante." }, { status: 400 });
  }

  const { data: campagne, error } = await auth.admin
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (error || !campagne) {
    return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });
  }

  if (campagne.status !== "en_cours") {
    return NextResponse.json({
      ok: true,
      campaignId,
      done: true,
      sentCount: campagne.sent_count,
      recipientsCount: campagne.recipients_count,
    });
  }

  if (!isMailConfigured()) {
    return NextResponse.json(
      { error: "Envoi non configuré : la campagne ne peut pas reprendre." },
      { status: 503 }
    );
  }

  const progres = await envoyerVague(auth.admin, campagne);
  return NextResponse.json({ ok: true, campaignId, ...progres });
}
