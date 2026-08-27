import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, "benevoles");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const patch = {};
  if (body?.debut !== undefined) patch.debut = body.debut;
  if (body?.fin !== undefined) patch.fin = body.fin;
  if (body?.nom !== undefined) patch.nom = body.nom?.trim() || null;
  if (body?.places !== undefined) {
    const places = Number(body.places);
    if (!Number.isFinite(places) || places < 1) {
      return NextResponse.json({ error: "Le nombre de places doit être d'au moins 1." }, { status: 400 });
    }
    patch.places = places;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("benevolat_creneaux")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, creneau: data });
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(request, "benevoles");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error } = await auth.admin.from("benevolat_creneaux").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
