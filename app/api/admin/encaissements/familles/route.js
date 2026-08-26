import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Liste légère des familles (id + parents avec leur e-mail), pour le champ
// de recherche du formulaire d'encaissement libre : rattachement à une
// famille, ou choix du parent à qui envoyer une demande de paiement.
// Volontairement séparée de /api/admin/familles pour ne pas exiger le droit
// "familles" en plus du droit "encaissements".
export async function GET(request) {
  const auth = await requirePermission(request, "encaissements");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: parents, error } = await auth.admin
    .from("parents")
    .select("id, family_id, first_name, last_name, email")
    .order("first_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const parFamille = new Map();
  for (const p of parents || []) {
    const nom = `${p.first_name || ""} ${p.last_name || ""}`.trim();
    if (!nom || !p.family_id) continue;
    if (!parFamille.has(p.family_id)) parFamille.set(p.family_id, []);
    parFamille.get(p.family_id).push({ id: p.id, firstName: p.first_name, lastName: p.last_name, email: p.email });
  }

  const familles = Array.from(parFamille.entries()).map(([id, parents]) => ({
    id,
    label: parents.map((p) => `${p.firstName} ${p.lastName}`.trim()).join(" & "),
    parents,
  }));

  return NextResponse.json({ ok: true, familles });
}
