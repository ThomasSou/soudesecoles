import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { POST as creerCampagneEmail } from "../emails/route";
import { APERCU_RECIPIENT, renderBlocksToHtml } from "../../../lib/emailBlocks";
import { ajouterMois, jourParis } from "../../../lib/datesParis";
import {
  DEBUT_NEWSLETTER,
  DEBUT_RAPPELS_PARTENAIRES,
  SEGMENT_FAMILLES,
  apercuEmail,
  construireNewsletter,
  executerAutomatismes,
} from "../../../lib/partenairesAuto";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// E-mails automatiques vers les partenaires et vers les familles
// (cf. app/lib/partenairesAuto.js).
//
// Deux façons d'être autorisé :
//  - la tâche planifiée quotidienne (netlify/functions/partenaires-auto-cron.mjs),
//    avec le jeton de service ADMIN_IMPORT_TOKEN ;
//  - un membre du bureau (droit « partenaires ») : aperçus, simulation,
//    création d'un brouillon.
function parJetonService(request) {
  const jeton = process.env.ADMIN_IMPORT_TOKEN;
  return Boolean(jeton) && request.headers.get("x-admin-token") === jeton;
}

async function autoriser(request) {
  if (parJetonService(request)) return { admin: createAdminClient(), service: true };
  const auth = await requirePermission(request, "partenaires");
  return auth;
}

// Crée une campagne e-mail en réutilisant la route d'envoi de l'éditeur
// (mêmes destinataires, mêmes règles), en lui transmettant l'autorisation reçue.
async function creerCampagne(request, blocs, sujet, segment, extra = {}) {
  const entetes = { "Content-Type": "application/json" };
  const bearer = request.headers.get("authorization");
  if (bearer) entetes.Authorization = bearer;
  const jeton = request.headers.get("x-admin-token");
  if (jeton) entetes["x-admin-token"] = jeton;
  const res = await creerCampagneEmail(
    new Request(new URL("/api/admin/emails", request.url), {
      method: "POST",
      headers: entetes,
      body: JSON.stringify({ subject: sujet, contentBlocks: blocs, segment, ...extra }),
    })
  );
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Création de la campagne impossible.");
  return d;
}

// GET ?apercu=newsletter|rappel_mensuel|rappel_evenement [&mois=AAAA-MM]
// Sans « apercu » : l'état des automatismes (dates de démarrage, journal).
export async function GET(request) {
  const auth = await autoriser(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = new URL(request.url).searchParams;
  const type = params.get("apercu");
  const jour = jourParis();
  const moisCourant = jour.iso.slice(0, 7);

  if (type === "newsletter") {
    const mois = /^\d{4}-\d{2}$/.test(params.get("mois") || "") ? params.get("mois") : ajouterMois(moisCourant, 1);
    const c = await construireNewsletter(auth.admin, mois, { exemple: true });
    return NextResponse.json({
      sujet: c.sujet,
      html: renderBlocksToHtml(c.blocs, { subject: c.sujet, recipient: APERCU_RECIPIENT }),
      exemple: c.exemple,
      messages: c.messages.length,
      mois,
    });
  }
  if (type === "rappel_mensuel" || type === "rappel_evenement") {
    const a = await apercuEmail(auth.admin, type, { mois: params.get("mois") || undefined });
    return NextResponse.json({ sujet: a.sujet, html: a.html });
  }

  const { data: journal } = await auth.admin
    .from("partenaire_emails_auto")
    .select("type, cle, envoye_le")
    .order("envoye_le", { ascending: false })
    .limit(15);
  return NextResponse.json({
    debutRappels: DEBUT_RAPPELS_PARTENAIRES,
    debutNewsletter: DEBUT_NEWSLETTER,
    journal: journal || [],
  });
}

// POST
//  - { action: "brouillon", mois? } : crée dans « E-mails » un BROUILLON de
//    l'e-mail aux familles (avec des messages d'exemple s'il n'y en a pas
//    encore de validé), pour le relire et le tester.
//  - { action: "simuler" } : dit ce que ferait la tâche d'aujourd'hui, sans rien envoyer.
//  - sans action (tâche planifiée) : exécute les automatismes du jour.
export async function POST(request) {
  const auth = await autoriser(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const jour = jourParis();

  if (body.action === "brouillon") {
    const mois = /^\d{4}-\d{2}$/.test(body.mois || "") ? body.mois : ajouterMois(jour.iso.slice(0, 7), 1);
    const c = await construireNewsletter(auth.admin, mois, { exemple: true });
    try {
      const d = await creerCampagne(request, c.blocs, c.sujet, SEGMENT_FAMILLES, { brouillon: true });
      return NextResponse.json({ ok: true, campaignId: d.campaignId, exemple: c.exemple });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  const simulation = body.action === "simuler";
  if (!simulation && !parJetonService(request)) {
    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  }

  try {
    const bilan = await executerAutomatismes(auth.admin, {
      simulation,
      creerCampagne: async (blocs, sujet, segment) => {
        const d = await creerCampagne(request, blocs, sujet, segment);
        return { campaignId: d.campaignId, recipientsCount: d.recipientsCount };
      },
    });
    return NextResponse.json({ ok: true, ...bilan });
  } catch (e) {
    console.error("[partenaires-auto]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
