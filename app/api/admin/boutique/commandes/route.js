import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

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
  return NextResponse.json({ ok: true, orders: data || [] });
}
