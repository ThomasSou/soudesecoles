import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";

export const dynamic = "force-dynamic";

function genererPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// GET : tous les avantages avec leur nombre d'utilisations.
// POST : création d'un nouvel avantage.
export async function GET(request) {
  const auth = await requirePermission(request, "avantages");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: avantages, error }, { data: utilisations }] = await Promise.all([
    auth.admin.from("avantages").select("*").order("created_at", { ascending: false }),
    auth.admin.from("avantage_utilisations").select("avantage_id"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const compteurs = {};
  for (const u of utilisations || []) {
    compteurs[u.avantage_id] = (compteurs[u.avantage_id] || 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    avantages: (avantages || []).map((a) => ({ ...a, utilisations: compteurs[a.id] || 0 })),
  });
}

export async function POST(request) {
  const auth = await requirePermission(request, "avantages");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const label = body?.label?.trim();
  const type = body?.type === "partenaire" ? "partenaire" : "interne";

  if (!label) return NextResponse.json({ error: "Le nom de l'avantage est obligatoire." }, { status: 400 });

  const insert = {
    label,
    type,
    partner_name: type === "partenaire" ? body?.partnerName?.trim() || null : null,
    pin_code: type === "partenaire" ? genererPin() : null,
    requiert_adhesion: body?.requiresMembership !== false,
    active: true,
  };

  const { data, error } = await auth.admin.from("avantages").insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, avantage: data });
}
