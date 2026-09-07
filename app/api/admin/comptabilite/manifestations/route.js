import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Manifestations partagées avec la partie Bénévoles (table
// benevolat_evenements). Ici, permission « comptabilite » : le bureau peut
// créer une manifestation depuis la compta sans droit sur les Bénévoles,
// pour ne pas être bloqué si la liste est vide.
export async function GET(request) {
  const auth = await requirePermission(request, "comptabilite");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("benevolat_evenements")
    .select("id, nom")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, evenements: data || [] });
}

export async function POST(request) {
  const auth = await requirePermission(request, "comptabilite");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const nom = body?.nom?.trim();
  if (!nom) {
    return NextResponse.json({ error: "Donnez un nom à la manifestation." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("benevolat_evenements")
    .insert({ nom, actif: true })
    .select("id, nom")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, evenement: data });
}
