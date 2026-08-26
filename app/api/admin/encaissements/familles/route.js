import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Liste légère des familles (id + noms des parents), pour le champ de
// recherche "Rattacher à une famille" du formulaire d'encaissement libre.
// Volontairement séparée de /api/admin/familles pour ne pas exiger le droit
// "familles" en plus du droit "encaissements".
export async function GET(request) {
  const auth = await requirePermission(request, "encaissements");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: parents, error } = await auth.admin
    .from("parents")
    .select("family_id, first_name, last_name")
    .order("first_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const parFamille = new Map();
  for (const p of parents || []) {
    const nom = `${p.first_name || ""} ${p.last_name || ""}`.trim();
    if (!nom) continue;
    const existant = parFamille.get(p.family_id);
    parFamille.set(p.family_id, existant ? `${existant} & ${nom}` : nom);
  }

  const familles = Array.from(parFamille.entries()).map(([id, label]) => ({ id, label }));

  return NextResponse.json({ ok: true, familles });
}
