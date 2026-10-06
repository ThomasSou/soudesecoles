import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { nettoyerOptions, nettoyerQuantiteMax } from "../../../../lib/boutiqueOptions";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function slugify(name) {
  return (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// GET : tous les produits (actifs et inactifs) pour la gestion back-office,
// filtrés sur une boutique (?boutiqueId=...) le cas échéant.
// POST : création d'un nouveau produit, rattaché à une boutique.
export async function GET(request) {
  const auth = await requirePermission(request, "boutique");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const boutiqueId = searchParams.get("boutiqueId");

  let query = auth.admin
    .from("shop_products")
    .select("*")
    .order("category")
    .order("position")
    .order("name");
  if (boutiqueId) query = query.eq("boutique_id", boutiqueId);

  const { data, error } = await query;

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
  if (!body?.boutiqueId) {
    return NextResponse.json({ error: "La boutique est obligatoire." }, { status: 400 });
  }
  if (!Number.isFinite(priceCents) || priceCents < 0) {
    return NextResponse.json({ error: "Le prix est invalide." }, { status: 400 });
  }

  const { options, error: optionsError } = nettoyerOptions(body?.options);
  if (optionsError) return NextResponse.json({ error: optionsError }, { status: 400 });

  // Colonnes ajoutées par la migration 0052 : écrites seulement si utilisées,
  // pour que la création d'un produit simple marche même avant la migration.
  const extras = {};
  const maxQuantity = nettoyerQuantiteMax(body?.maxQuantity);
  if (maxQuantity !== undefined && maxQuantity !== null) extras.max_quantity = maxQuantity;
  if (options.length > 0) extras.options = options;

  const { data, error } = await auth.admin
    .from("shop_products")
    .insert({
      ...extras,
      name,
      slug: `${slugify(name)}-${Date.now().toString(36)}`,
      description: body?.description?.trim() || null,
      price_cents: priceCents,
      image_url: body?.imageUrl || null,
      category: body?.category?.trim() || null,
      boutique_id: body.boutiqueId,
      active: body?.active !== false,
      position: Number(body?.position) || 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, product: data });
}
