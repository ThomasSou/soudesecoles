import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { isMailConfigured } from "../../../../lib/mail";
import { envoyerVague } from "../../../../lib/emailCampagne";

export const dynamic = "force-dynamic";

// Fenêtre du verrou d'envoi. Tant qu'une vague écrit `updated_at` plus
// souvent que ça (elle l'écrit avant ET après chaque e-mail), aucune autre
// requête /continuer ne se lance en parallèle sur la même campagne. Passé ce
// délai sans écriture, on considère la vague précédente morte (fonction
// coupée) et on reprend.
// 90 s : très au-dessus de la durée maximale d'un seul envoi (Sender borné à
// 8 s + SMTP borné à ~18 s, cf. app/lib/mail.js) — le verrou ne peut donc
// pas expirer au milieu d'une vague et laisser un autre onglet ré-envoyer.
const VERROU_MS = 90000;

// Lecture légère de l'avancement d'une campagne : le front l'interroge en
// boucle courte pour afficher une progression qui bouge même quand la boucle
// d'envoi ne tourne pas (page rechargée, autre onglet).
export async function GET(request) {
  const auth = await requirePermission(request, "emails");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Campagne manquante." }, { status: 400 });
  }

  const { data: campagne, error } = await auth.admin
    .from("email_campaigns")
    .select("id, status, sent_count, recipients_count, next_index, segment, segment_summary")
    .eq("id", id)
    .maybeSingle();

  if (error || !campagne) {
    return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    campaignId: campagne.id,
    status: campagne.status,
    sentCount: campagne.sent_count,
    recipientsCount: campagne.recipients_count,
    nextIndex: campagne.next_index,
    done: campagne.status !== "en_cours",
    canaux: campagne.segment?.canaux || null,
    segmentSummary: campagne.segment_summary || null,
  });
}

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

  // Verrou optimiste : on ne bouge le curseur que si personne d'autre n'a
  // touché la campagne depuis VERROU_MS. Le UPDATE conditionnel sur
  // `updated_at` est atomique — deux requêtes concurrentes, une seule
  // décroche le verrou, l'autre repart en attente.
  const limite = new Date(Date.now() - VERROU_MS).toISOString();
  const { data: verrou } = await auth.admin
    .from("email_campaigns")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "en_cours")
    .lt("updated_at", limite)
    .select("id");

  if (!verrou || verrou.length === 0) {
    return NextResponse.json({
      ok: true,
      campaignId,
      verrouille: true,
      done: false,
      sentCount: campagne.sent_count,
      recipientsCount: campagne.recipients_count,
    });
  }

  const progres = await envoyerVague(auth.admin, campagne);
  return NextResponse.json({ ok: true, campaignId, ...progres });
}
