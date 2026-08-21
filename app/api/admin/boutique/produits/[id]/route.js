import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";

export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, "boutique");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const patch = {};
  if (body?.name !== undefined) patch.name = body.name.trim();
  if (body?.description !== undefined) patch.description = body.description?.trim() || null;
  if (body?.priceEuros !== undefined) {
    const priceCents = Math.round(Number(body.priceEuros) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      return NextResponse.json({ error: "Le prix est invalide." }, { status: 400 });
    }
    patch.price_cents = priceCents;
  }
  if (body?.imageUrl !== undefined) patch.image_url = body.imageUrl || null;
  if (body?.category !== undefined) patch.category = body.category?.trim() || null;
  if (body?.boutiqueId !== undefined) patch.boutique_id = body.boutiqueId || null;
  if (body?.active !== undefined) patch.active = Boolean(body.active);
  if (body?.position !== undefined) patch.position = Number(body.position) || 0;

  const { data, error } = await auth.admin
    .from("shop_products")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, product: data });
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(request, "boutique");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error } = await auth.admin.from("shop_products").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
