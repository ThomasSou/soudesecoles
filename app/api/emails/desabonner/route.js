import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";

// Lien de désinscription en pied de chaque e-mail envoyé. Accessible sans
// connexion (lien cliqué depuis la boîte mail) : marque simplement ce
// parent comme ne souhaitant plus recevoir d'e-mails du Sou.
export async function GET(request) {
  const parentId = new URL(request.url).searchParams.get("p");

  const page = (message, ok) => new NextResponse(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title>Désinscription</title>
    <style>body{font-family:Arial,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#334155;padding:0 20px;}
    h1{color:#1F3864;font-size:20px;}a{color:#1F3864;}</style></head>
    <body><h1>Sou des Écoles Montmerle-Lurcy</h1><p>${message}</p><p><a href="https://soumontmerle.netlify.app">Retour au site</a></p></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

  if (!parentId) {
    return page("Lien de désinscription invalide.", false);
  }

  const admin = createAdminClient();
  const { error } = await admin.from("parents").update({ email_opt_out: true }).eq("id", parentId);

  if (error) {
    return page("Une erreur est survenue, merci de nous contacter directement.", false);
  }

  return page("Vous ne recevrez plus nos e-mails. Vous pouvez toujours consulter votre espace adhérent en ligne.", true);
}
