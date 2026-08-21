// Paiement en ligne de la cotisation, directement depuis l'espace adhérent
// (paiement HelloAsso en pleine page, retour via returnUrl).
import { createAdminClient } from "./supabaseServerAdmin";
import { getCheckoutIntent, checkoutIntentIsPaid } from "./helloasso";

// Revérifie auprès de HelloAsso si la cotisation en attente pour cette
// famille/année a bien été payée, et met à jour `memberships` le cas
// échéant. Ne fait jamais confiance à l'état local seul.
export async function confirmMembershipIfPaid(familyId, schoolYear) {
  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("memberships")
    .select("*")
    .eq("family_id", familyId)
    .eq("school_year", schoolYear)
    .maybeSingle();

  if (!membership) return { paid: false };
  if (membership.paid_at) return { paid: true, membership };
  if (!membership.helloasso_payment_id) return { paid: false };

  let intent;
  try {
    intent = await getCheckoutIntent(membership.helloasso_payment_id);
  } catch {
    return { paid: false };
  }

  if (!checkoutIntentIsPaid(intent)) {
    return { paid: false };
  }

  const { data: updated } = await admin
    .from("memberships")
    .update({ paid_at: new Date().toISOString(), payment_method: "helloasso" })
    .eq("id", membership.id)
    .select()
    .single();

  await admin
    .from("families")
    .update({ status_current_year: "adherent" })
    .eq("id", familyId);

  return { paid: true, membership: updated };
}
