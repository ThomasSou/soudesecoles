import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// GET : tous les événements avec leurs ateliers, créneaux et nombre
// d'inscrits par créneau, en un seul appel (sert tout le tableau de bord).
// POST : création d'un nouvel événement.
export async function GET(request) {
  const auth = await requirePermission(request, "benevoles");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: evenements, error }, { data: ateliers }, { data: creneaux }, { data: inscriptions }] =
    await Promise.all([
      auth.admin.from("benevolat_evenements").select("*").order("created_at", { ascending: false }),
      auth.admin.from("benevolat_ateliers").select("*").order("position").order("created_at"),
      auth.admin.from("benevolat_creneaux").select("*").order("debut"),
      auth.admin.from("benevolat_inscriptions").select("creneau_id"),
    ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const inscritsParCreneau = {};
  for (const i of inscriptions || []) {
    inscritsParCreneau[i.creneau_id] = (inscritsParCreneau[i.creneau_id] || 0) + 1;
  }

  const creneauxParAtelier = {};
  for (const c of creneaux || []) {
    if (!creneauxParAtelier[c.atelier_id]) creneauxParAtelier[c.atelier_id] = [];
    creneauxParAtelier[c.atelier_id].push({ ...c, inscrits: inscritsParCreneau[c.id] || 0 });
  }

  const ateliersParEvenement = {};
  for (const a of ateliers || []) {
    if (!ateliersParEvenement[a.evenement_id]) ateliersParEvenement[a.evenement_id] = [];
    ateliersParEvenement[a.evenement_id].push({ ...a, creneaux: creneauxParAtelier[a.id] || [] });
  }

  return NextResponse.json({
    ok: true,
    evenements: (evenements || []).map((e) => ({
      ...e,
      ateliers: ateliersParEvenement[e.id] || [],
    })),
  });
}

export async function POST(request) {
  const auth = await requirePermission(request, "benevoles");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const nom = body?.nom?.trim();
  if (!nom) return NextResponse.json({ error: "Le nom de l'événement est obligatoire." }, { status: 400 });

  const { data, error } = await auth.admin
    .from("benevolat_evenements")
    .insert({ nom, actif: true })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, evenement: { ...data, ateliers: [] } });
}
