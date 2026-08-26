import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// PATCH : renommer un partenaire, l'activer/désactiver, ou régénérer son
// code PIN (par exemple s'il a été compromis).
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, "avantages");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const update = {};

  if (typeof body?.active === "boolean") update.active = body.active;
  if (typeof body?.nom === "string" && body.nom.trim()) update.nom = body.nom.trim();
  if (body?.regeneratePin) update.pin_code = String(Math.floor(1000 + Math.random() * 9000));

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("partenaires")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, partenaire: data });
}
