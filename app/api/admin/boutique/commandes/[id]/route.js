import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";
import { getCheckoutIntent, checkoutIntentIsPaid } from "../../../../../lib/helloasso";
import { confirmOrderIfPaid } from "../../../../../lib/boutiqueOrders";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Supprime une commande EN ATTENTE (panier abandonné, erreur de saisie...).
// Une commande payée ne se supprime jamais ici. Garde-fou : une commande
// « en attente » peut en réalité avoir été réglée chez HelloAsso sans que le
// retour sur le site ait eu lieu ; on revérifie donc le paiement avant de
// supprimer, pour ne jamais perdre une vraie vente.
export async function DELETE(request, { params }) {
  const auth = await requirePermission(request, "boutique");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: order } = await auth.admin
    .from("shop_orders")
    .select("id, status, checkout_intent_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  if (order.status !== "pending") {
    return NextResponse.json({ error: "Seules les commandes en attente peuvent être supprimées." }, { status: 409 });
  }

  if (order.checkout_intent_id) {
    let intent;
    try {
      intent = await getCheckoutIntent(order.checkout_intent_id);
    } catch {
      return NextResponse.json(
        { error: "Impossible de vérifier le paiement auprès de HelloAsso pour le moment. Réessayez dans un instant." },
        { status: 503 }
      );
    }
    if (checkoutIntentIsPaid(intent)) {
      await confirmOrderIfPaid(order.id);
      return NextResponse.json(
        { error: "Cette commande a en fait été payée : elle vient d'être marquée « Payée » et n'a pas été supprimée." },
        { status: 409 }
      );
    }
  }

  const { error } = await auth.admin.from("shop_orders").delete().eq("id", order.id).eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
