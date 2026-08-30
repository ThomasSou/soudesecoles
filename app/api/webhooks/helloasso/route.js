import { NextResponse } from "next/server";
import { confirmOrderIfPaid } from "../../../lib/boutiqueOrders";
import { confirmMembershipIfPaid } from "../../../lib/adhesionPaiement";
import { HELLOASSO_NOTIFICATION_IPS } from "../../../lib/helloasso";

export const dynamic = "force-dynamic";

// Notification HelloAsso (à configurer côté HelloAsso : Organisation >
// Paramètres > Notifications, une fois que Thomas y a accès). Tant que ce
// réglage n'est pas fait, les pages de retour (/boutique pour les commandes,
// /espace-adherent pour les cotisations) restent le mécanisme principal de
// confirmation — ce webhook est une sécurité supplémentaire, pas un point de
// passage obligé.
export async function POST(request) {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const ip = forwardedFor.split(",")[0].trim();
  if (ip && !HELLOASSO_NOTIFICATION_IPS.includes(ip)) {
    // IP inattendue : on ignore poliment plutôt que de faire confiance.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const payload = await request.json().catch(() => null);
  // Les métadonnées qu'on a nous-mêmes passées à la création de l'intention
  // de paiement peuvent arriver soit sous `data.metadata`, soit sous
  // `metadata` selon la forme de l'événement HelloAsso.
  const metadata = payload?.data?.metadata || payload?.metadata || null;

  const orderId = metadata?.orderId || null;
  if (orderId) {
    // Branche boutique : inchangée. confirmOrderIfPaid revérifie le paiement
    // auprès de HelloAsso et est idempotent (ne fait rien si la commande est
    // déjà "paid"), donc un webhook reçu plusieurs fois est sans effet.
    await confirmOrderIfPaid(orderId);
    return NextResponse.json({ ok: true });
  }

  // Branche adhésion (cotisation) : même principe que la boutique. On
  // reconnaît une notification d'adhésion aux métadonnées posées par
  // /api/espace-adherent/adherer (`kind: "adhesion"` + `familyId` +
  // `schoolYear`). confirmMembershipIfPaid revérifie le paiement auprès de
  // HelloAsso avant toute écriture et sort immédiatement si `paid_at` est
  // déjà renseigné : un webhook reçu en double, reçu après confirmation par
  // la page de retour, ou visant une cotisation encaissée à la main par le
  // bureau, est donc un non-événement.
  if (
    metadata?.kind === "adhesion" &&
    metadata?.familyId &&
    metadata?.schoolYear
  ) {
    await confirmMembershipIfPaid(metadata.familyId, metadata.schoolYear);
    return NextResponse.json({ ok: true });
  }

  // Pas de métadonnées exploitables (autre type d'événement HelloAsso, ou
  // format de payload différent de celui anticipé) : on ignore sans faire
  // échouer la requête, pour éviter des réessais inutiles côté HelloAsso.
  return NextResponse.json({ ok: true, ignored: true });
}
