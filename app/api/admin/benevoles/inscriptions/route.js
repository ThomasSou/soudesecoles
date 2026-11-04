import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { currentSchoolYear } from "../../../../lib/anneeScolaire";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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
    .select("id, creneau_id, first_name, last_name, email, phone, created_at, parent_id, family_id")
    .in("creneau_id", creneauIds)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enfants (et classes) de chaque bénévole, quand on sait le rattacher à une
  // famille : d'abord par le compte connecté lors de l'inscription
  // (family_id / parent_id), à défaut par l'adresse e-mail saisie, comparée à
  // celle des parents. Un bénévole sans lien (grand-parent, ami...) n'a
  // simplement pas d'enfants affichés.
  const emails = [...new Set((inscriptions || []).map((i) => (i.email || "").toLowerCase()).filter(Boolean))];
  const { data: parentsParEmail } = emails.length
    ? await auth.admin.from("parents").select("id, family_id, email").in("email", emails)
    : { data: [] };
  const parentsParId = {};
  const famillesParEmail = {};
  for (const p of parentsParEmail || []) {
    parentsParId[p.id] = p;
    const cle = (p.email || "").toLowerCase();
    if (p.family_id) (famillesParEmail[cle] = famillesParEmail[cle] || new Set()).add(p.family_id);
  }
  const idsParents = [...new Set((inscriptions || []).map((i) => i.parent_id).filter((id) => id && !parentsParId[id]))];
  if (idsParents.length) {
    const { data: autres } = await auth.admin.from("parents").select("id, family_id").in("id", idsParents);
    for (const p of autres || []) parentsParId[p.id] = p;
  }
  const famillesDe = (i) => {
    const ids = new Set();
    if (i.family_id) ids.add(i.family_id);
    if (i.parent_id && parentsParId[i.parent_id]?.family_id) ids.add(parentsParId[i.parent_id].family_id);
    if (ids.size === 0) for (const f of famillesParEmail[(i.email || "").toLowerCase()] || []) ids.add(f);
    return ids;
  };
  const toutesFamilles = [...new Set((inscriptions || []).flatMap((i) => [...famillesDe(i)]))];
  const { data: enfantsFamilles } = toutesFamilles.length
    ? await auth.admin
        .from("children")
        .select("family_id, first_name, class_level, school_year")
        .in("family_id", toutesFamilles)
        .eq("school_year", currentSchoolYear())
    : { data: [] };

  return NextResponse.json({
    ok: true,
    inscriptions: (inscriptions || []).map((i) => {
      const familles = famillesDe(i);
      const enfants = (enfantsFamilles || [])
        .filter((c) => familles.has(c.family_id))
        .map((c) => ({ prenom: c.first_name, classe: c.class_level || "" }));
      const creneau = creneauById[i.creneau_id];
      const atelier = creneau ? atelierParId[creneau.atelier_id] : null;
      return {
        ...i,
        enfants,
        atelierNom: atelier?.nom || "",
        evenementNom: atelier ? nomEvenementParId[atelier.evenement_id] || "" : "",
        debut: creneau?.debut || null,
        fin: creneau?.fin || null,
      };
    }),
  });
}
