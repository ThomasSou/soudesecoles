import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

// Planning public des créneaux bénévoles — ouvert à tout visiteur, aucune
// inscription requise pour consulter.
export async function GET() {
  const admin = createAdminClient();

  const { data: evenements, error } = await admin
    .from("benevolat_evenements")
    .select("id, nom")
    .eq("actif", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!evenements || evenements.length === 0) {
    return NextResponse.json({ ok: true, evenements: [] });
  }

  const evenementIds = evenements.map((e) => e.id);

  const { data: ateliers, error: ateliersError } = await admin
    .from("benevolat_ateliers")
    .select("id, evenement_id, nom, description, position")
    .in("evenement_id", evenementIds)
    .order("position");

  console.error(
    "[planning] evenementIds =", JSON.stringify(evenementIds),
    "ateliersError =", ateliersError?.message,
    "ateliers.length =", ateliers?.length
  );

  const atelierIds = (ateliers || []).map((a) => a.id);

  const [{ data: creneaux }, { data: inscriptions }] = await Promise.all([
    atelierIds.length
      ? admin
          .from("benevolat_creneaux")
          .select("id, atelier_id, debut, fin, places, nom")
          .in("atelier_id", atelierIds)
          .order("debut")
      : Promise.resolve({ data: [] }),
    atelierIds.length
      ? admin.from("benevolat_inscriptions").select("creneau_id, first_name, last_name")
      : Promise.resolve({ data: [] }),
  ]);

  const inscritsParCreneau = {};
  const nomsParCreneau = {};
  for (const i of inscriptions || []) {
    inscritsParCreneau[i.creneau_id] = (inscritsParCreneau[i.creneau_id] || 0) + 1;
    (nomsParCreneau[i.creneau_id] = nomsParCreneau[i.creneau_id] || []).push(
      `${i.first_name} ${(i.last_name || "").charAt(0)}.`
    );
  }

  const creneauxParAtelier = {};
  for (const c of creneaux || []) {
    if (!creneauxParAtelier[c.atelier_id]) creneauxParAtelier[c.atelier_id] = [];
    creneauxParAtelier[c.atelier_id].push({
      id: c.id,
      nom: c.nom,
      debut: c.debut,
      fin: c.fin,
      places: c.places,
      placesRestantes: Math.max(0, c.places - (inscritsParCreneau[c.id] || 0)),
      inscrits: nomsParCreneau[c.id] || [],
    });
  }

  const ateliersParEvenement = {};
  for (const a of ateliers || []) {
    if (!ateliersParEvenement[a.evenement_id]) ateliersParEvenement[a.evenement_id] = [];
    ateliersParEvenement[a.evenement_id].push({ ...a, creneaux: creneauxParAtelier[a.id] || [] });
  }

  return NextResponse.json({
    ok: true,
    evenements: evenements.map((e) => ({ ...e, ateliers: ateliersParEvenement[e.id] || [] })),
  });
}
