import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { createAdminClient } from "../../../../lib/supabaseServerAdmin";
import { isMailConfigured } from "../../../../lib/mail";
import { envoyerVague } from "../../../../lib/emailCampagne";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Fenêtre du verrou d'envoi. Tant qu'une vague écrit `updated_at` plus
// souvent que ça (elle l'écrit avant ET après chaque e-mail), aucune autre
// requête /continuer ne se lance en parallèle sur la même campagne. Passé ce
// délai sans écriture, on considère la vague précédente morte (fonction
// coupée) et on reprend.
//
// 20 s : c'est aussi le délai minimum entre deux vagues d'une MÊME boucle
// d'envoi — la vague précédente vient d'écrire `updated_at`, donc la
// suivante doit attendre que cette écriture ait 20 s pour reprendre la
// main. 90 s bridait l'envoi à ~1 vague / 90 s (≈ 1,3 e-mail/min). Une
// vague dure au pire ~13 s (planning borné 2,5 s + 2 envois à ~5 s), donc
// 20 s laisse une marge suffisante : le verrou ne peut pas expirer au
// milieu d'une vague. Le curseur `next_index` (écrit après CHAQUE e-mail)
// limite de toute façon à un seul e-mail l'exposition si deux requêtes se
// chevauchaient.
const VERROU_MS = 20000;

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

// Avance UNE campagne "en_cours" d'une vague, en posant le même verrou
// optimiste que l'appel manuel depuis l'éditeur (cf. plus bas) : on ne bouge
// le curseur que si personne d'autre n'a touché la campagne depuis VERROU_MS.
// Factorisé pour être appelé soit pour une campagne précise (bouton "Reprendre
// l'envoi"), soit pour toutes les campagnes en attente (cron, voir plus bas).
async function avancerUneCampagne(admin, campagne) {
  const campaignId = campagne.id;

  if (campagne.status !== "en_cours") {
    return {
      campaignId,
      done: true,
      sentCount: campagne.sent_count,
      recipientsCount: campagne.recipients_count,
    };
  }

  const limite = new Date(Date.now() - VERROU_MS).toISOString();
  const { data: verrou } = await admin
    .from("email_campaigns")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "en_cours")
    .lt("updated_at", limite)
    .select("id");

  if (!verrou || verrou.length === 0) {
    return {
      campaignId,
      verrouille: true,
      done: false,
      sentCount: campagne.sent_count,
      recipientsCount: campagne.recipients_count,
    };
  }

  const progres = await envoyerVague(admin, campagne);
  return { campaignId, ...progres };
}

// Envoie la vague suivante d'une campagne déjà démarrée (cf.
// app/api/admin/emails). Le front appelle cette route en boucle, avec une
// courte pause entre chaque vague, jusqu'à `done: true`. Idempotent : une
// campagne déjà terminée renvoie simplement done avec son compteur final.
//
// Deux façons d'être autorisé :
// - jeton d'admin (Bearer, via requirePermission) : c'est l'éditeur qui
//   appelle, avec un campaignId précis.
// - jeton de service (en-tête x-admin-token = ADMIN_IMPORT_TOKEN, même jeton
//   que les autres routes d'automatisation) : c'est la fonction de fond
//   Netlify (netlify/functions/envoi-emails-background.mjs, déclenchée toutes
//   les 10 min) qui appelle SANS campaignId, pour avancer TOUTES les
//   campagnes restées "en_cours" — afin
//   qu'un envoi continue même si personne n'a d'onglet /admin/emails ouvert
//   (cf. panne du 29/09/2026 : l'AG s'est arrêtée net dès que l'ordinateur a
//   été fermé, faute d'autre mécanisme pour faire avancer les vagues).
export async function POST(request) {
  const jetonService = request.headers.get("x-admin-token");
  const viaCron = Boolean(jetonService) && jetonService === process.env.ADMIN_IMPORT_TOKEN;

  let admin;
  if (viaCron) {
    admin = createAdminClient();
  } else {
    const auth = await requirePermission(request, "emails");
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    admin = auth.admin;
  }

  if (!isMailConfigured()) {
    return NextResponse.json(
      { error: "Envoi non configuré : la campagne ne peut pas reprendre." },
      { status: 503 }
    );
  }

  const { campaignId } = await request.json().catch(() => ({}));

  if (!campaignId) {
    if (!viaCron) {
      return NextResponse.json({ error: "Campagne manquante." }, { status: 400 });
    }
    // Cron sans campaignId ciblé : avance toutes les campagnes en attente,
    // chacune d'une vague. Le verrou par campagne évite tout doublon si un
    // humain a par ailleurs un onglet ouvert en même temps.
    const { data: enCours, error } = await admin
      .from("email_campaigns")
      .select("*")
      .eq("status", "en_cours");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const resultats = [];
    for (const campagne of enCours || []) {
      resultats.push(await avancerUneCampagne(admin, campagne));
    }
    return NextResponse.json({ ok: true, campagnes: resultats });
  }

  const { data: campagne, error } = await admin
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (error || !campagne) {
    return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });
  }

  const progres = await avancerUneCampagne(admin, campagne);
  return NextResponse.json({ ok: true, ...progres });
}
