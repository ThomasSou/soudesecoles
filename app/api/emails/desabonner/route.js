import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

// Lien de désinscription en pied de chaque e-mail envoyé. Accessible sans
// connexion (lien cliqué depuis la boîte mail) : marque simplement le
// destinataire comme ne souhaitant plus recevoir d'e-mails du Sou.
// Deux types de destinataires : un parent (?p=<id>, table parents) ou un
// contact léger sans fiche famille (?c=<id>, table email_contacts).

function cibleDesinscription(request) {
  const params = new URL(request.url).searchParams;
  return {
    parentId: params.get("p"),
    contactId: params.get("c"),
    campaignId: params.get("camp"),
  };
}

// Compteur de désinscriptions par campagne (agrégat, aucune donnée par
// personne). Sans incidence si la colonne n'existe pas encore (migration
// 0033 non appliquée).
async function incrementerDesinscriptionCampagne(admin, campaignId) {
  try {
    const { data } = await admin
      .from("email_campaigns")
      .select("unsub_count")
      .eq("id", campaignId)
      .maybeSingle();
    if (!data) return;
    await admin
      .from("email_campaigns")
      .update({ unsub_count: (data.unsub_count || 0) + 1 })
      .eq("id", campaignId);
  } catch {
    /* un compteur perdu est sans conséquence */
  }
}

async function desinscrire({ parentId, contactId, campaignId }) {
  const admin = createAdminClient();
  let ok = false;
  if (parentId) {
    const { error } = await admin.from("parents").update({ email_opt_out: true }).eq("id", parentId);
    ok = !error;
  } else if (contactId) {
    const { error } = await admin
      .from("email_contacts")
      .update({ email_opt_out: true })
      .eq("id", contactId);
    ok = !error;
  }
  if (ok && campaignId) await incrementerDesinscriptionCampagne(admin, campaignId);
  return ok;
}

// Désinscription « en un clic » (RFC 8058) : quand l'e-mail porte les en-têtes
// List-Unsubscribe / List-Unsubscribe-Post, la messagerie du destinataire
// (Gmail, Apple Mail...) envoie un POST directement à cette URL depuis son
// bouton natif « Se désinscrire », sans ouvrir de page. On répond sans corps.
export async function POST(request) {
  const ok = await desinscrire(cibleDesinscription(request));
  return new NextResponse(null, { status: ok ? 200 : 400 });
}

// Lien cliqué manuellement dans le pied de l'e-mail : on renvoie une page de
// confirmation lisible.
export async function GET(request) {
  const cible = cibleDesinscription(request);

  const page = (message, ok) => new NextResponse(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title>Désinscription</title>
    <style>body{font-family:Arial,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#334155;padding:0 20px;}
    h1{color:#1F3864;font-size:20px;}a{color:#1F3864;}</style></head>
    <body><h1>Sou des Écoles Montmerle-Lurcy</h1><p>${message}</p><p><a href="https://sou-montmerle.fr">Retour au site</a></p></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

  if (!cible.parentId && !cible.contactId) {
    return page("Lien de désinscription invalide.", false);
  }

  const ok = await desinscrire(cible);

  if (!ok) {
    return page("Une erreur est survenue, merci de nous contacter directement.", false);
  }

  return page("Vous ne recevrez plus nos e-mails. Vous pouvez toujours consulter votre espace adhérent en ligne.", true);
}
