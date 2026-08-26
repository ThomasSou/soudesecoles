import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, "benevoles");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const patch = {};
  if (body?.nom !== undefined) patch.nom = body.nom?.trim();
  if (body?.description !== undefined) patch.description = body.description?.trim() || null;
  if (body?.position !== undefined) patch.position = Number(body.position) || 0;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("benevolat_ateliers")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, atelier: data });
}

// Supprime l'atelier, et avec lui (en cascade) ses créneaux et les
// inscriptions déjà prises dessus : à utiliser avec précaution.
export async function DELETE(request, { params }) {
  const auth = await requirePermission(request, "benevoles");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error } = await auth.admin.from("benevolat_ateliers").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
