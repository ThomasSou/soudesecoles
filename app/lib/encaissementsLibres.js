// Logique partagée pour confirmer un encaissement libre (appelée par la
// page de retour du back-office). Même principe que boutiqueOrders.js :
// jamais confiance dans un simple paramètre d'URL, on revérifie toujours le
// statut réel auprès de HelloAsso avant d'enregistrer le paiement.
import { createAdminClient } from "./supabaseServerAdmin";
import { getCheckoutIntent, checkoutIntentIsPaid } from "./helloasso";
import { currentSchoolYear } from "./anneeScolaire";

export async function confirmEncaissementIfPaid(id) {
  const admin = createAdminClient();

  const { data: encaissement } = await admin
    .from("encaissements_libres")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!encaissement) return null;
  if (encaissement.status === "paid") return encaissement;
  if (!encaissement.checkout_intent_id) return encaissement;

  let intent;
  try {
    intent = await getCheckoutIntent(encaissement.checkout_intent_id);
  } catch {
    return encaissement; // HelloAsso injoignable : on garde le statut actuel, on retentera plus tard.
  }

  if (!checkoutIntentIsPaid(intent)) {
    return encaissement;
  }

  const helloassoOrderId = intent.order?.id ? String(intent.order.id) : null;

  const { data: updated } = await admin
    .from("encaissements_libres")
    .update({ status: "paid", paid_at: new Date().toISOString(), helloasso_order_id: helloassoOrderId })
    .eq("id", encaissement.id)
    .select()
    .single();

  // Rattaché à une famille : recopié dans `purchases` pour apparaître dans
  // son historique d'achat sur /espace-adherent, comme la boutique.
  if (updated?.family_id) {
    await admin.from("purchases").insert({
      family_id: updated.family_id,
      school_year: currentSchoolYear(),
      label: updated.motif,
      event_name: "Encaissement libre",
      amount: updated.montant_cents / 100,
      payment_method: "helloasso",
      external_id: updated.helloasso_order_id || updated.checkout_intent_id,
      purchased_at: updated.paid_at,
    });
  }

  return updated || encaissement;
}
