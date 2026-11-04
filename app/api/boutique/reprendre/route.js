import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { confirmOrderIfPaid, creerIntentPourCommande } from "../../../lib/boutiqueOrders";
import { isHelloAssoConfigured } from "../../../lib/helloasso";
import { SITE_URL } from "../../../lib/emailBlocks";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Lien du mail de relance : « Payer ma commande ». On ne met pas directement
// l'adresse HelloAsso dans le mail (elle expire vite) : ce lien refait une
// intention de paiement toute fraîche au moment du clic, puis redirige vers
// HelloAsso. L'identifiant de commande (UUID) est impossible à deviner ; au
// pire, quelqu'un qui le connaîtrait ne pourrait que PAYER cette commande.
export async function GET(request) {
  const id = new URL(request.url).searchParams.get("commande");
  const retour = (chemin) => NextResponse.redirect(`${SITE_URL}${chemin}`, 302);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return retour("/boutique");

  const admin = createAdminClient();
  const { data: order } = await admin.from("shop_orders").select("*").eq("id", id).maybeSingle();
  if (!order || order.status !== "pending") {
    // Déjà payée (ou annulée) : on renvoie sur la boutique, qui affiche l'état.
    return retour(order?.status === "paid" ? `/boutique?commande=${id}&statut=retour` : "/boutique");
  }
  if (!isHelloAssoConfigured()) return retour("/boutique");

  // Peut-être payée entre-temps sans que le retour ait eu lieu.
  const verifiee = await confirmOrderIfPaid(id);
  if (verifiee?.status === "paid") return retour(`/boutique?commande=${id}&statut=retour`);

  try {
    const intent = await creerIntentPourCommande(admin, order);
    return NextResponse.redirect(intent.redirectUrl, 302);
  } catch {
    return retour(`/boutique?commande=${id}&statut=erreur`);
  }
}
