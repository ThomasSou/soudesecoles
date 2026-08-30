import { incrementerStat } from "../../../lib/stats";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

// Image transparente de 1x1 pixel, insérée en bas des e-mails. Son chargement
// signale une ouverture. AUCUNE donnée personnelle : on incrémente seulement
// un compteur — soit par campagne (?c=<id> → email_campaigns.opens_count),
// soit global par objet (?e=... → /admin/statistiques).
// À savoir : la plupart des messageries bloquent les images par défaut, ce
// chiffre est donc toujours un minimum, jamais un compte exact.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

async function incrementerOuvertureCampagne(campaignId) {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("email_campaigns")
      .select("opens_count")
      .eq("id", campaignId)
      .maybeSingle();
    if (!data) return;
    await admin
      .from("email_campaigns")
      .update({ opens_count: (data.opens_count || 0) + 1 })
      .eq("id", campaignId);
  } catch {
    // Un compteur d'ouverture perdu n'a aucune conséquence.
  }
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const campaignId = params.get("c");
  const envoi = params.get("e");

  if (campaignId) await incrementerOuvertureCampagne(campaignId);
  else if (envoi) await incrementerStat("email_ouverture", envoi);

  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
