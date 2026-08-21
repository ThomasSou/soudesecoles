import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// PATCH : modifier le nom, la description, la date de fermeture, l'ordre
// d'affichage ou activer/désactiver une boutique.
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, "boutique");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const patch = {};

  if (body?.name !== undefined) patch.name = body.name?.trim();
  if (body?.description !== undefined) patch.description = body.description?.trim() || null;
  if (body?.dateFermeture !== undefined) patch.date_fermeture = body.dateFermeture || null;
  if (body?.active !== undefined) patch.active = Boolean(body.active);
  if (body?.position !== undefined) patch.position = Number(body.position) || 0;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("boutiques")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, boutique: data });
}
