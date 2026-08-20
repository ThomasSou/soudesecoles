import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

// Catalogue public de la boutique — ouvert à tout visiteur, pas seulement
// aux familles adhérentes.
export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shop_products")
    .select("id, slug, name, description, price_cents, image_url, category")
    .eq("active", true)
    .order("category")
    .order("position")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, products: data || [] });
}
