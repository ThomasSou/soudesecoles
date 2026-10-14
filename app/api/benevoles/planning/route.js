import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { chargerEvenements } from "../../../lib/evenementsSite";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Planning public des créneaux bénévoles — ouvert à tout visiteur, aucune
// inscription requise pour consulter.
export async function GET() {
  const admin = createAdminClient();

  const { data: evenements, error } = await admin
    .from("benevolat_evenements")
    .select("id, nom, description")
    .eq("actif", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!evenements || evenements.length === 0) {
    return NextResponse.json({ ok: true, evenements: [] });
  }

  const evenementIds = evenements.map((e) => e.id);

  const { data: ateliers } = await admin
    .from("benevolat_ateliers")
    .select("id, evenement_id, nom, description, position")
    .in("evenement_id", evenementIds)
    .order("position");

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

  // En-tête explicite : la page publique liste des créneaux qui se libèrent
  // en temps réel (inscriptions concurrentes) et a déjà été vue affichant des
  // données périmées à cause d'une mise en cache intermédiaire — on interdit
  // donc tout cache (CDN ou navigateur), pas seulement le "force-dynamic" de
  // Next.js qui ne l'empêche pas toujours pour un GET.
  // Ordre d'affichage : la prochaine manifestation en premier (c'est elle qui
  // s'ouvre par défaut sur la page publique), puis les suivantes par date,
  // puis celles sans date connue, puis les manifestations passées. La date
  // vient du calendrier des événements (rapprochement par nom) ; à défaut, du
  // premier créneau à venir de la manifestation.
  const norm = (t) =>
    (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const calendrier = await chargerEvenements();
  const dateParNom = new Map(calendrier.map((e) => [norm(e.name), e.endDate || e.date]));
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const liste = evenements.map((e) => {
    const ateliersE = ateliersParEvenement[e.id] || [];
    let dateRef = dateParNom.get(norm(e.nom)) || null;
    if (!dateRef) {
      const futurs = ateliersE
        .flatMap((a) => a.creneaux)
        .map((c) => (c.debut || "").slice(0, 10))
        .filter((d) => d >= aujourdhui)
        .sort();
      dateRef = futurs[0] || null;
    }
    return { ...e, ateliers: ateliersE, dateReference: dateRef };
  });

  const rang = (e) => (!e.dateReference ? 1 : e.dateReference >= aujourdhui ? 0 : 2);
  liste.sort(
    (a, b) =>
      rang(a) - rang(b) ||
      (rang(a) === 2
        ? b.dateReference.localeCompare(a.dateReference)
        : (a.dateReference || "").localeCompare(b.dateReference || "")) ||
      a.nom.localeCompare(b.nom, "fr")
  );

  return NextResponse.json(
    {
      ok: true,
      evenements: liste,
    },
    { headers: { "Cache-Control": "no-store, must-revalidate" } }
  );
}
