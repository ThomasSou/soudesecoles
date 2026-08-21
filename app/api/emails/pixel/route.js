import { incrementerStat } from "../../../lib/stats";

export const dynamic = "force-dynamic";

// Image transparente de 1x1 pixel, insérée en bas des e-mails. Son chargement
// signale une ouverture. Aucune donnée personnelle n'est enregistrée : on
// incrémente seulement un compteur pour l'envoi concerné (?e=...).
// À savoir : la plupart des messageries bloquent les images par défaut, ce
// chiffre est donc toujours un minimum, jamais un compte exact.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(request) {
  const envoi = new URL(request.url).searchParams.get("e");

  if (envoi) await incrementerStat("email_ouverture", envoi);

  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
