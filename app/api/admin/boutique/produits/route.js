import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

function slugify(name) {
  return (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// GET : tous les produits (actifs et inactifs) pour la gestion back-office.
// POST : création d'un nouveau produit.
export async function GET(request) {
  const auth = await requirePermission(request, "boutique");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("shop_products")
    .select("*")
    .order("category")
    .order("position")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, products: data || [] });
}

export async function POST(request) {
  const auth = await requirePermission(request, "boutique");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const name = body?.name?.trim();
  const priceCents = Math.round(Number(body?.priceEuros) * 100);

  if (!name) return NextResponse.json({ error: "Le nom du produit est obligatoire." }, { status: 400 });
  if (!Number.isFinite(priceCents) || priceCents < 0) {
    return NextResponse.json({ error: "Le prix est invalide." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("shop_products")
    .insert({
      name,
      slug: `${slugify(name)}-${Date.now().toString(36)}`,
      description: body?.description?.trim() || null,
      price_cents: priceCents,
      image_url: body?.imageUrl || null,
      category: body?.category?.trim() || null,
      active: body?.active !== false,
      position: Number(body?.position) || 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, product: data });
}
