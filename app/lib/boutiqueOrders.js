// Logique partagée pour confirmer une commande boutique (appelée à la fois
// par la page de retour /boutique et par le webhook HelloAsso).
import { createAdminClient } from "./supabaseServerAdmin";
import { getCheckoutIntent, checkoutIntentIsPaid, createCheckoutIntent } from "./helloasso";
import { SITE_URL } from "./emailBlocks";

// Revérifie le statut réel auprès de HelloAsso (jamais de confiance
// aveugle dans un webhook ou un paramètre d'URL) et met à jour la commande.
// Si la commande est payée et rattachée à une famille connue, on la
// recopie aussi dans `purchases` pour réutiliser l'historique déjà affiché
// sur /espace-adherent.
export async function confirmOrderIfPaid(orderId) {
  const admin = createAdminClient();

  const { data: order } = await admin
    .from("shop_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;
  if (order.status === "paid") return order;
  if (!order.checkout_intent_id) return order;

  let intent;
  try {
    intent = await getCheckoutIntent(order.checkout_intent_id);
  } catch {
    return order; // HelloAsso injoignable : on garde le statut actuel, on retentera plus tard.
  }

  if (!checkoutIntentIsPaid(intent)) {
    return order;
  }

  const helloassoOrderId = intent.order?.id ? String(intent.order.id) : null;

  const { data: updated } = await admin
    .from("shop_orders")
    .update({ status: "paid", paid_at: new Date().toISOString(), helloasso_order_id: helloassoOrderId })
    .eq("id", order.id)
    .select()
    .single();

  if (updated?.family_id) {
    const label = (updated.items || [])
      .map(
        (it) =>
          `${it.qty}x ${it.name}${
            Array.isArray(it.options) && it.options.length > 0
              ? ` (${it.options.map((o) => o.value).join(", ")})`
              : ""
          }`
      )
      .join(", ");
    await admin.from("purchases").insert({
      family_id: updated.family_id,
      school_year: currentSchoolYearFallback(),
      label: label || "Achat boutique",
      event_name: "Boutique",
      amount: updated.total_cents / 100,
      payment_method: "helloasso",
      external_id: updated.helloasso_order_id || updated.checkout_intent_id,
      purchased_at: updated.paid_at,
    });
  }

  return updated || order;
}

function currentSchoolYearFallback() {
  const date = new Date();
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 8 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

// Libellé d'une commande pour HelloAsso et pour les e-mails (« 2x Sapin (Taille : M) »).
export function libelleCommande(items) {
  return (
    (items || [])
      .map(
        (it) =>
          `${it.qty}x ${it.name}${
            Array.isArray(it.options) && it.options.length > 0 ? ` (${it.options.map((o) => o.value).join(", ")})` : ""
          }`
      )
      .join(", ") || "Boutique Sou des Écoles"
  );
}

// Crée une NOUVELLE intention de paiement pour une commande déjà enregistrée
// (le lien d'une intention HelloAsso n'est valable que peu de temps : pour une
// relance ou une reprise, on en refait une à la demande) et la mémorise sur
// la commande, pour que le retour et le webhook retrouvent la bonne commande.
export async function creerIntentPourCommande(admin, order) {
  const intent = await createCheckoutIntent({
    totalCents: order.total_cents,
    itemName: `Boutique Sou des Écoles — ${libelleCommande(order.items)}`,
    backUrl: `${SITE_URL}/boutique`,
    errorUrl: `${SITE_URL}/boutique?commande=${order.id}&statut=erreur`,
    returnUrl: `${SITE_URL}/boutique?commande=${order.id}&statut=retour`,
    payer: {
      firstName: order.buyer_first_name,
      lastName: order.buyer_last_name,
      email: order.buyer_email,
    },
    metadata: { orderId: order.id },
  });
  await admin.from("shop_orders").update({ checkout_intent_id: intent.id }).eq("id", order.id);
  return intent;
}
