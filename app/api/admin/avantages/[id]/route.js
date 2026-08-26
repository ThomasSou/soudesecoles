import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// GET : détail d'un avantage avec la liste des familles l'ayant utilisé.
export async function GET(request, { params }) {
  const auth = await requirePermission(request, "avantages");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: avantage, error } = await auth.admin
    .from("avantages")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!avantage) return NextResponse.json({ error: "Avantage introuvable." }, { status: 404 });

  const { data: utilisations } = await auth.admin
    .from("avantage_utilisations")
    .select("id, used_at, used_by, family_id")
    .eq("avantage_id", params.id)
    .order("used_at", { ascending: false });

  const familyIds = [...new Set((utilisations || []).map((u) => u.family_id))];
  const { data: parents } = familyIds.length
    ? await auth.admin.from("parents").select("family_id, first_name, last_name").in("family_id", familyIds)
    : { data: [] };

  const nomsParFamille = {};
  for (const p of parents || []) {
    const nom = `${p.first_name || ""} ${p.last_name || ""}`.trim();
    if (!nom) continue;
    nomsParFamille[p.family_id] = nomsParFamille[p.family_id]
      ? `${nomsParFamille[p.family_id]} & ${nom}`
      : nom;
  }

  return NextResponse.json({
    ok: true,
    avantage,
    utilisations: (utilisations || []).map((u) => ({
      ...u,
      familyName: nomsParFamille[u.family_id] || "Famille",
    })),
  });
}

// PATCH : activer/désactiver, changer le libellé, ou régénérer le code PIN.
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, "avantages");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const update = {};

  if (typeof body?.active === "boolean") update.active = body.active;
  if (typeof body?.label === "string" && body.label.trim()) update.label = body.label.trim();
  if (body?.regeneratePin) update.pin_code = String(Math.floor(1000 + Math.random() * 9000));
  if (body?.limite !== undefined) {
    const limite = Number(body.limite);
    if (!Number.isFinite(limite) || limite < 1) {
      return NextResponse.json({ error: "La limite doit être d'au moins 1." }, { status: 400 });
    }
    update.limite = limite;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("avantages")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, avantage: data });
}
