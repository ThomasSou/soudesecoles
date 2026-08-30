import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

const PERM = "avantages";
const MOYENS = ["virement", "cheque", "especes", "autre"];

// POST : enregistre un paiement reçu d'un partenaire (saisie manuelle, le
// virement lui-même se fait hors du site). La liste est renvoyée par
// GET /api/admin/partenaires/[id].
export async function POST(request, { params }) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const montant = Number(body?.montantEuros);
  const recuLe = body?.recuLe;

  if (!Number.isFinite(montant) || montant <= 0) {
    return NextResponse.json({ error: "Le montant doit être supérieur à 0." }, { status: 400 });
  }
  if (!recuLe) {
    return NextResponse.json({ error: "La date de réception est obligatoire." }, { status: 400 });
  }
  const moyen = MOYENS.includes(body?.moyen) ? body.moyen : "virement";

  const { data, error } = await auth.admin
    .from("partenaire_paiements")
    .insert({
      partenaire_id: params.id,
      periode_id: body?.periodeId || null,
      montant_cents: Math.round(montant * 100),
      recu_le: recuLe,
      moyen,
      reference: body?.reference?.trim() || null,
      note: body?.note?.trim() || null,
      created_by: auth.parent.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, paiement: data });
}
