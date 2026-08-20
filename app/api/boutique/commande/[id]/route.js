import { NextResponse } from "next/server";
import { confirmOrderIfPaid } from "../../../../lib/boutiqueOrders";

// Statut d'une commande, consulté depuis la page de retour /boutique.
// Revérifie systématiquement auprès de HelloAsso (voir confirmOrderIfPaid)
// plutôt que de faire confiance au seul webhook, qui n'est pas encore
// configuré côté HelloAsso.
export async function GET(request, { params }) {
  const order = await confirmOrderIfPaid(params.id);
  if (!order) {
    return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    order: {
      id: order.id,
      status: order.status,
      items: order.items,
      totalCents: order.total_cents,
      createdAt: order.created_at,
      paidAt: order.paid_at,
    },
  });
}
