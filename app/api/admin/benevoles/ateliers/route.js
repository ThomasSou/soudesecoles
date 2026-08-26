import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Crée un atelier (poste) au sein d'un événement.
export async function POST(request) {
  const auth = await requirePermission(request, "benevoles");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const nom = body?.nom?.trim();
  const evenementId = body?.evenementId;
  if (!nom || !evenementId) {
    return NextResponse.json({ error: "Nom et événement obligatoires." }, { status: 400 });
  }

  const { data: maxPos } = await auth.admin
    .from("benevolat_ateliers")
    .select("position")
    .eq("evenement_id", evenementId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await auth.admin
    .from("benevolat_ateliers")
    .insert({
      evenement_id: evenementId,
      nom,
      description: body?.description?.trim() || null,
      position: (maxPos?.position ?? -1) + 1,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, atelier: { ...data, creneaux: [] } });
}
