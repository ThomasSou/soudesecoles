import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

// Lien de désinscription en pied de chaque e-mail envoyé. Accessible sans
// connexion (lien cliqué depuis la boîte mail) : marque simplement ce
// parent comme ne souhaitant plus recevoir d'e-mails du Sou.

async function desinscrire(parentId) {
  if (!parentId) return false;
  const admin = createAdminClient();
  const { error } = await admin.from("parents").update({ email_opt_out: true }).eq("id", parentId);
  return !error;
}

// Désinscription « en un clic » (RFC 8058) : quand l'e-mail porte les en-têtes
// List-Unsubscribe / List-Unsubscribe-Post, la messagerie du destinataire
// (Gmail, Apple Mail...) envoie un POST directement à cette URL depuis son
// bouton natif « Se désinscrire », sans ouvrir de page. On répond sans corps.
export async function POST(request) {
  const parentId = new URL(request.url).searchParams.get("p");
  const ok = await desinscrire(parentId);
  return new NextResponse(null, { status: ok ? 200 : 400 });
}

// Lien cliqué manuellement dans le pied de l'e-mail : on renvoie une page de
// confirmation lisible.
export async function GET(request) {
  const parentId = new URL(request.url).searchParams.get("p");

  const page = (message, ok) => new NextResponse(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title>Désinscription</title>
    <style>body{font-family:Arial,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#334155;padding:0 20px;}
    h1{color:#1F3864;font-size:20px;}a{color:#1F3864;}</style></head>
    <body><h1>Sou des Écoles Montmerle-Lurcy</h1><p>${message}</p><p><a href="https://sou-montmerle.fr">Retour au site</a></p></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

  if (!parentId) {
    return page("Lien de désinscription invalide.", false);
  }

  const ok = await desinscrire(parentId);

  if (!ok) {
    return page("Une erreur est survenue, merci de nous contacter directement.", false);
  }

  return page("Vous ne recevrez plus nos e-mails. Vous pouvez toujours consulter votre espace adhérent en ligne.", true);
}
