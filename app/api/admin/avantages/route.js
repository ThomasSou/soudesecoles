import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// GET : tous les avantages avec leur nombre d'utilisations et, pour les
// avantages partenaires, le nom du partenaire associé.
// POST : création d'un nouvel avantage (interne, ou rattaché à un
// partenaire existant — voir /api/admin/partenaires pour en créer un).
export async function GET(request) {
  const auth = await requirePermission(request, "avantages");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: avantages, error }, { data: utilisations }, { data: partenaires }] = await Promise.all([
    auth.admin.from("avantages").select("*").order("created_at", { ascending: false }),
    auth.admin.from("avantage_utilisations").select("avantage_id"),
    auth.admin.from("partenaires").select("id, nom"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const compteurs = {};
  for (const u of utilisations || []) {
    compteurs[u.avantage_id] = (compteurs[u.avantage_id] || 0) + 1;
  }
  const nomParPartenaire = Object.fromEntries((partenaires || []).map((p) => [p.id, p.nom]));

  return NextResponse.json({
    ok: true,
    avantages: (avantages || []).map((a) => ({
      ...a,
      utilisations: compteurs[a.id] || 0,
      partenaireNom: a.partenaire_id ? nomParPartenaire[a.partenaire_id] || null : null,
    })),
  });
}

export async function POST(request) {
  const auth = await requirePermission(request, "avantages");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const label = body?.label?.trim();
  const type = body?.type === "partenaire" ? "partenaire" : "interne";

  if (!label) return NextResponse.json({ error: "Le nom de l'avantage est obligatoire." }, { status: 400 });
  if (type === "partenaire" && !body?.partenaireId) {
    return NextResponse.json({ error: "Choisissez un partenaire." }, { status: 400 });
  }

  const limite = Number(body?.limite) || 1;
  if (limite < 1) {
    return NextResponse.json({ error: "La limite doit être d'au moins 1." }, { status: 400 });
  }

  const insert = {
    label,
    type,
    partenaire_id: type === "partenaire" ? body.partenaireId : null,
    requiert_adhesion: body?.requiresMembership !== false,
    limite,
    active: true,
  };

  const { data, error } = await auth.admin.from("avantages").insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, avantage: { ...data, utilisations: 0 } });
}
