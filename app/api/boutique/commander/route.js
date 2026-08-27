import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { createCheckoutIntent, isHelloAssoConfigured } from "../../../lib/helloasso";
import { SITE_URL } from "../../../lib/emailBlocks";

// Crée une commande boutique + une intention de paiement HelloAsso.
// Ouvert à tout visiteur (pas d'authentification requise) : si un jeton de
// session est fourni, on l'utilise UNIQUEMENT pour retrouver le parent
// connecté côté serveur (jamais un parentId envoyé tel quel par le client).
export async function POST(request) {
  if (!isHelloAssoConfigured()) {
    return NextResponse.json(
      { error: "Le paiement en ligne n'est pas encore configuré. Merci de réessayer plus tard." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : [];
  const buyer = body?.buyer || {};

  if (items.length === 0) {
    return NextResponse.json({ error: "Le panier est vide." }, { status: 400 });
  }
  if (!buyer.firstName?.trim() || !buyer.lastName?.trim() || !buyer.email?.trim() || !buyer.phone?.trim()) {
    return NextResponse.json(
      { error: "Merci d'indiquer votre nom, prénom, e-mail et téléphone." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Acheteur connecté ? (facultatif — retrouvé via le jeton, jamais via le corps de la requête)
  let parentId = null;
  let familyId = null;
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (accessToken) {
    const { data: userData } = await admin.auth.getUser(accessToken);
    if (userData?.user) {
      const { data: parent } = await admin
        .from("parents")
        .select("id, family_id")
        .eq("auth_user_id", userData.user.id)
        .maybeSingle();
      if (parent) {
        parentId = parent.id;
        familyId = parent.family_id;
      }
    }
  }

  // Prix recalculés côté serveur à partir du catalogue — jamais depuis le client.
  const productIds = items.map((it) => it.productId).filter(Boolean);
  const { data: products, error: productsError } = await admin
    .from("shop_products")
    .select("id, name, price_cents, active, boutiques(active, date_fermeture)")
    .in("id", productIds);

  if (productsError) {
    return NextResponse.json({ error: productsError.message }, { status: 500 });
  }

  const productById = new Map((products || []).map((p) => [p.id, p]));
  const orderItems = [];
  let totalCents = 0;
  const maintenant = new Date();

  for (const it of items) {
    const product = productById.get(it.productId);
    const qty = Math.max(1, Math.min(50, Number(it.qty) || 0));
    const boutiqueOuverte =
      product?.boutiques?.active &&
      (!product.boutiques.date_fermeture || new Date(product.boutiques.date_fermeture) >= maintenant);
    if (!product || !product.active || !boutiqueOuverte || qty <= 0) {
      return NextResponse.json({ error: "Un des articles du panier n'est plus disponible." }, { status: 400 });
    }
    orderItems.push({ productId: product.id, name: product.name, unitPriceCents: product.price_cents, qty });
    totalCents += product.price_cents * qty;
  }

  if (totalCents <= 0) {
    return NextResponse.json({ error: "Le montant de la commande est invalide." }, { status: 400 });
  }

  const { data: order, error: orderError } = await admin
    .from("shop_orders")
    .insert({
      items: orderItems,
      total_cents: totalCents,
      buyer_first_name: buyer.firstName.trim(),
      buyer_last_name: buyer.lastName.trim(),
      buyer_email: buyer.email.trim(),
      buyer_phone: buyer.phone.trim(),
      parent_id: parentId,
      family_id: familyId,
      status: "pending",
    })
    .select()
    .single();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  const itemName = orderItems.map((it) => `${it.qty}x ${it.name}`).join(", ") || "Boutique Sou des Écoles";

  let intent;
  try {
    intent = await createCheckoutIntent({
      totalCents,
      itemName: `Boutique Sou des Écoles — ${itemName}`,
      backUrl: `${SITE_URL}/boutique`,
      errorUrl: `${SITE_URL}/boutique?commande=${order.id}&statut=erreur`,
      returnUrl: `${SITE_URL}/boutique?commande=${order.id}&statut=retour`,
      payer: {
        firstName: buyer.firstName.trim(),
        lastName: buyer.lastName.trim(),
        email: buyer.email.trim(),
      },
      metadata: { orderId: order.id },
    });
  } catch (err) {
    await admin.from("shop_orders").update({ status: "failed" }).eq("id", order.id);
    return NextResponse.json(
      { error: "Le paiement en ligne n'est pas disponible pour le moment. Merci de réessayer plus tard." },
      { status: 502 }
    );
  }

  await admin.from("shop_orders").update({ checkout_intent_id: intent.id }).eq("id", order.id);

  return NextResponse.json({ ok: true, orderId: order.id, redirectUrl: intent.redirectUrl });
}
