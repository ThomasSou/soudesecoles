import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Crée un créneau horaire pour un atelier (les créneaux de deux ateliers
// différents peuvent se chevaucher : les besoins sont simultanés).
export async function POST(request) {
  const auth = await requirePermission(request, "benevoles");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const atelierId = body?.atelierId;
  const debut = body?.debut;
  const fin = body?.fin;
  const places = Number(body?.places);

  if (!atelierId || !debut || !fin) {
    return NextResponse.json({ error: "Atelier, début et fin obligatoires." }, { status: 400 });
  }
  if (!Number.isFinite(places) || places < 1) {
    return NextResponse.json({ error: "Le nombre de places doit être d'au moins 1." }, { status: 400 });
  }
  if (new Date(fin) <= new Date(debut)) {
    return NextResponse.json({ error: "L'heure de fin doit être après l'heure de début." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("benevolat_creneaux")
    .insert({ atelier_id: atelierId, debut, fin, places })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, creneau: { ...data, inscrits: 0 } });
}
