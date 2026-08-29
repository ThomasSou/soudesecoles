import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

const PERM = "avantages";

// PATCH : corriger une période, ou l'annuler (annulee = true) sans la
// supprimer pour garder la trace. DELETE : suppression sèche (à réserver
// aux saisies erronées).
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const update = {};
  if (typeof body?.debut === "string") update.debut = body.debut;
  if (typeof body?.fin === "string") update.fin = body.fin;
  if (typeof body?.niveau === "string") update.niveau = body.niveau.trim() || null;
  if (typeof body?.note === "string") update.note = body.note.trim() || null;
  if (typeof body?.annulee === "boolean") update.annulee = body.annulee;
  if (body?.montantAnnonceEuros !== undefined) {
    const m = body.montantAnnonceEuros;
    update.montant_annonce_cents = m === null || m === "" ? null : Math.round(Number(m) * 100);
  }

  if (update.debut && update.fin && update.fin < update.debut) {
    return NextResponse.json({ error: "La date de fin doit suivre la date de début." }, { status: 400 });
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("partenaire_periodes")
    .update(update)
    .eq("id", params.periodeId)
    .eq("partenaire_id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, periode: data });
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error } = await auth.admin
    .from("partenaire_periodes")
    .delete()
    .eq("id", params.periodeId)
    .eq("partenaire_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
