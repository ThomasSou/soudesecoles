import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

const PERM = "avantages";
const MOYENS = ["virement", "cheque", "especes", "autre"];

// PATCH : corriger une ligne de paiement. DELETE : la supprimer (saisie
// erronée).
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const update = {};
  if (body?.montantEuros !== undefined) {
    const m = Number(body.montantEuros);
    if (!Number.isFinite(m) || m <= 0) {
      return NextResponse.json({ error: "Montant invalide." }, { status: 400 });
    }
    update.montant_cents = Math.round(m * 100);
  }
  if (typeof body?.recuLe === "string" && body.recuLe) update.recu_le = body.recuLe;
  if (MOYENS.includes(body?.moyen)) update.moyen = body.moyen;
  if (typeof body?.reference === "string") update.reference = body.reference.trim() || null;
  if (typeof body?.note === "string") update.note = body.note.trim() || null;
  if (body?.periodeId !== undefined) update.periode_id = body.periodeId || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("partenaire_paiements")
    .update(update)
    .eq("id", params.paiementId)
    .eq("partenaire_id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, paiement: data });
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error } = await auth.admin
    .from("partenaire_paiements")
    .delete()
    .eq("id", params.paiementId)
    .eq("partenaire_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
