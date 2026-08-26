import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabaseServerAdmin";
import { resolvePartenaire } from "../../../../lib/avantages";

export const dynamic = "force-dynamic";

// Permet à un partenaire connecté de modifier un avantage qui lui
// appartient (jamais celui d'un autre partenaire, ni un avantage interne).
export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => null);
  const { partenaireId, pin } = body || {};
  if (!partenaireId || !pin) {
    return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });
  }

  const admin = createAdminClient();
  const partenaire = await resolvePartenaire(admin, partenaireId, pin);
  if (!partenaire) return NextResponse.json({ error: "Compte partenaire invalide." }, { status: 404 });

  const { data: existant } = await admin
    .from("avantages")
    .select("id, partenaire_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!existant || existant.partenaire_id !== partenaireId) {
    return NextResponse.json({ error: "Avantage introuvable." }, { status: 404 });
  }

  const update = {};
  if (typeof body?.active === "boolean") update.active = body.active;
  if (typeof body?.label === "string" && body.label.trim()) update.label = body.label.trim();
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

  const { data, error } = await admin
    .from("avantages")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, avantage: data });
}
