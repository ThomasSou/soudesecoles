import { NextResponse } from "next/server";
import { resolvePartenaireSession, tracerEvenementAvantage } from "../../../../lib/partenaires";

export const dynamic = "force-dynamic";

// Le partenaire connecté modifie un de SES avantages (jamais celui d'un
// autre partenaire ni un avantage interne). Toute modification part en ligne
// directement et est tracée dans avantage_evenements.
export async function PATCH(request, { params }) {
  const session = await resolvePartenaireSession(request);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });
  const { admin, partenaire } = session;

  const { data: existant } = await admin
    .from("avantages")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!existant || existant.partenaire_id !== partenaire.id) {
    return NextResponse.json({ error: "Avantage introuvable." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const update = {};
  if (typeof body?.label === "string" && body.label.trim()) update.label = body.label.trim();
  if (typeof body?.description === "string") update.description = body.description.trim() || null;
  if (typeof body?.requiresMembership === "boolean") update.requiert_adhesion = body.requiresMembership;
  if (typeof body?.active === "boolean") update.active = body.active;
  if (body?.quantiteParFamille !== undefined || body?.limite !== undefined) {
    const q = Number(body?.quantiteParFamille ?? body?.limite);
    if (!Number.isFinite(q) || q < 1) {
      return NextResponse.json({ error: "La quantité par famille doit être d'au moins 1." }, { status: 400 });
    }
    update.limite = q;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from("avantages")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let action = "modifie";
  if (typeof body?.active === "boolean" && Object.keys(update).length === 2) {
    action = body.active ? "active" : "desactive";
  }
  await tracerEvenementAvantage(admin, {
    avantage: data,
    action,
    partenaireId: partenaire.id,
    auteur: "partenaire",
  });

  return NextResponse.json({ ok: true, avantage: data });
}
