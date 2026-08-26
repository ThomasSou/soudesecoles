import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Liste les inscriptions avec le nom de l'événement, de l'atelier et les
// horaires du créneau déjà joints, prête à afficher/imprimer/exporter.
// Sans ?evenementId, renvoie l'historique complet, tous événements
// confondus (vue "Historique" du back-office).
export async function GET(request) {
  const auth = await requirePermission(request, "benevoles");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const evenementId = searchParams.get("evenementId");

  let requeteAteliers = auth.admin.from("benevolat_ateliers").select("id, nom, evenement_id");
  if (evenementId) requeteAteliers = requeteAteliers.eq("evenement_id", evenementId);
  const { data: ateliers, error: ateliersError } = await requeteAteliers;

  if (ateliersError) return NextResponse.json({ error: ateliersError.message }, { status: 500 });
  const atelierIds = (ateliers || []).map((a) => a.id);
  if (atelierIds.length === 0) return NextResponse.json({ ok: true, inscriptions: [] });

  const evenementIds = [...new Set((ateliers || []).map((a) => a.evenement_id))];
  const { data: evenements } = await auth.admin
    .from("benevolat_evenements")
    .select("id, nom")
    .in("id", evenementIds);
  const nomEvenementParId = Object.fromEntries((evenements || []).map((e) => [e.id, e.nom]));
  const atelierParId = Object.fromEntries((ateliers || []).map((a) => [a.id, a]));

  const { data: creneaux, error: creneauxError } = await auth.admin
    .from("benevolat_creneaux")
    .select("id, atelier_id, debut, fin")
    .in("atelier_id", atelierIds);

  if (creneauxError) return NextResponse.json({ error: creneauxError.message }, { status: 500 });
  const creneauIds = (creneaux || []).map((c) => c.id);
  const creneauById = Object.fromEntries((creneaux || []).map((c) => [c.id, c]));

  if (creneauIds.length === 0) return NextResponse.json({ ok: true, inscriptions: [] });

  const { data: inscriptions, error } = await auth.admin
    .from("benevolat_inscriptions")
    .select("id, creneau_id, first_name, last_name, email, phone, created_at")
    .in("creneau_id", creneauIds)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    inscriptions: (inscriptions || []).map((i) => {
      const creneau = creneauById[i.creneau_id];
      const atelier = creneau ? atelierParId[creneau.atelier_id] : null;
      return {
        ...i,
        atelierNom: atelier?.nom || "",
        evenementNom: atelier ? nomEvenementParId[atelier.evenement_id] || "" : "",
        debut: creneau?.debut || null,
        fin: creneau?.fin || null,
      };
    }),
  });
}
