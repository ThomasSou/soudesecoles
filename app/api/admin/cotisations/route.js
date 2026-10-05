import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Liste des cotisations (table memberships) avec le nom de la famille, pour
// que le bureau voie ce qui a été encaissé : en ligne via HelloAsso, ou saisi
// à la main (chèque, espèces, carte). Les lignes sans paid_at sont des
// paiements commencés mais pas aboutis (ou à encaisser), pas des recettes.
export async function GET(request) {
  const auth = await requirePermission(request, "familles");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = auth.admin;

  const [membershipsRes, parentsRes, childrenRes] = await Promise.all([
    admin.from("memberships").select("*").order("paid_at", { ascending: false, nullsFirst: false }),
    admin.from("parents").select("family_id, first_name, last_name"),
    admin.from("children").select("family_id, last_name"),
  ]);

  if (membershipsRes.error) {
    return NextResponse.json({ error: membershipsRes.error.message }, { status: 500 });
  }

  const nomParFamille = new Map();
  for (const p of parentsRes.data || []) {
    const nom = `${p.first_name || ""} ${p.last_name || ""}`.trim();
    if (!nom) continue;
    const liste = nomParFamille.get(p.family_id) || [];
    liste.push(nom);
    nomParFamille.set(p.family_id, liste);
  }
  const enfantParFamille = new Map();
  for (const c of childrenRes.data || []) {
    if (c.last_name && !enfantParFamille.has(c.family_id)) enfantParFamille.set(c.family_id, c.last_name);
  }

  const cotisations = (membershipsRes.data || []).map((m) => ({
    id: m.id,
    familyId: m.family_id,
    famille:
      nomParFamille.get(m.family_id)?.join(" & ") ||
      (enfantParFamille.has(m.family_id) ? `Famille ${enfantParFamille.get(m.family_id)}` : "Famille sans nom"),
    anneeScolaire: m.school_year,
    montant: m.amount == null ? null : Number(m.amount),
    payeeLe: m.paid_at,
    creeeLe: m.created_at,
    mode: m.payment_method || null,
    note: m.note || null,
  }));

  return NextResponse.json({ cotisations });
}
