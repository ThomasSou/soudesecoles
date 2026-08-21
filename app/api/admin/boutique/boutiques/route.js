import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

function slugify(name) {
  return (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// GET : toutes les boutiques avec leur nombre de produits.
// POST : création d'une nouvelle boutique.
export async function GET(request) {
  const auth = await requirePermission(request, "boutique");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: boutiques, error }, { data: produits }] = await Promise.all([
    auth.admin.from("boutiques").select("*").order("position").order("created_at"),
    auth.admin.from("shop_products").select("boutique_id"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const compteurs = {};
  for (const p of produits || []) {
    if (!p.boutique_id) continue;
    compteurs[p.boutique_id] = (compteurs[p.boutique_id] || 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    boutiques: (boutiques || []).map((b) => ({ ...b, produits: compteurs[b.id] || 0 })),
  });
}

export async function POST(request) {
  const auth = await requirePermission(request, "boutique");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "Le nom de la boutique est obligatoire." }, { status: 400 });

  const { data: maxPos } = await auth.admin
    .from("boutiques")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await auth.admin
    .from("boutiques")
    .insert({
      name,
      slug: `${slugify(name)}-${Date.now().toString(36)}`,
      description: body?.description?.trim() || null,
      date_fermeture: body?.dateFermeture || null,
      active: true,
      position: (maxPos?.position ?? -1) + 1,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, boutique: data });
}
