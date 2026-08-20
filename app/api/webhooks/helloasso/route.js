import { NextResponse } from "next/server";
import { confirmOrderIfPaid } from "../../../lib/boutiqueOrders";
import { HELLOASSO_NOTIFICATION_IPS } from "../../../lib/helloasso";

// Notification HelloAsso (à configurer côté HelloAsso : Organisation >
// Paramètres > Notifications, une fois que Thomas y a accès). Tant que ce
// réglage n'est pas fait, la page de retour /boutique (confirmOrderIfPaid)
// reste le mécanisme principal de confirmation — ce webhook est une
// sécurité supplémentaire, pas un point de passage obligé.
export async function POST(request) {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const ip = forwardedFor.split(",")[0].trim();
  if (ip && !HELLOASSO_NOTIFICATION_IPS.includes(ip)) {
    // IP inattendue : on ignore poliment plutôt que de faire confiance.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const payload = await request.json().catch(() => null);
  const orderId =
    payload?.data?.metadata?.orderId ||
    payload?.metadata?.orderId ||
    null;

  if (orderId) {
    await confirmOrderIfPaid(orderId);
    return NextResponse.json({ ok: true });
  }

  // Pas d'orderId dans les métadonnées (autre type d'événement HelloAsso, ou
  // format de payload différent de celui anticipé) : on ignore sans faire
  // échouer la requête, pour éviter des réessais inutiles côté HelloAsso.
  return NextResponse.json({ ok: true, ignored: true });
}
