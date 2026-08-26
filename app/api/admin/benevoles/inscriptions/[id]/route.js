import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Retire un bénévole d'un créneau (désistement signalé par téléphone,
// erreur de saisie...).
export async function DELETE(request, { params }) {
  const auth = await requirePermission(request, "benevoles");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error } = await auth.admin.from("benevolat_inscriptions").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
