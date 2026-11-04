import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Liste des commandes de la boutique, les plus récentes en premier.
export async function GET(request) {
  const auth = await requirePermission(request, "boutique");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("shop_orders")
    .select(
      "id, items, total_cents, buyer_first_name, buyer_last_name, buyer_email, buyer_phone, status, created_at, paid_at"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // La boutique (donc la manifestation) d'une commande se déduit de ses
  // produits : chaque ligne garde l'identifiant du produit commandé, et chaque
  // produit appartient à une boutique. Pas de migration nécessaire.
  const { data: produits } = await auth.admin.from("shop_products").select("id, boutique_id");
  const boutiqueParProduit = Object.fromEntries((produits || []).map((p) => [p.id, p.boutique_id]));
  const orders = (data || []).map((o) => ({
    ...o,
    boutiqueIds: [
      ...new Set((o.items || []).map((it) => boutiqueParProduit[it.productId]).filter(Boolean)),
    ],
  }));
  return NextResponse.json({ ok: true, orders });
}
