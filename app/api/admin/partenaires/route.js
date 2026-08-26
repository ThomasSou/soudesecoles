import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";

export const dynamic = "force-dynamic";

function genererPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// GET : liste des comptes partenaires avec leur nombre d'avantages créés.
// POST : création d'un nouveau compte partenaire (code PIN généré
// automatiquement, à communiquer au partenaire).
export async function GET(request) {
  const auth = await requirePermission(request, "avantages");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: partenaires, error }, { data: avantages }] = await Promise.all([
    auth.admin.from("partenaires").select("*").order("created_at", { ascending: false }),
    auth.admin.from("avantages").select("partenaire_id").eq("type", "partenaire"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const compteurs = {};
  for (const a of avantages || []) {
    if (!a.partenaire_id) continue;
    compteurs[a.partenaire_id] = (compteurs[a.partenaire_id] || 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    partenaires: (partenaires || []).map((p) => ({ ...p, avantages: compteurs[p.id] || 0 })),
  });
}

export async function POST(request) {
  const auth = await requirePermission(request, "avantages");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const nom = body?.nom?.trim();
  if (!nom) return NextResponse.json({ error: "Le nom du partenaire est obligatoire." }, { status: 400 });

  const { data, error } = await auth.admin
    .from("partenaires")
    .insert({ nom, pin_code: genererPin(), active: true })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, partenaire: { ...data, avantages: 0 } });
}
