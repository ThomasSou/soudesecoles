import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "refused", "reimbursed"];

// Change le statut d'une demande (traitée : remboursée ou refusée) et/ou sa
// note interne. C'est ce changement, fait ici, qui fait apparaître le
// statut "Remboursé" côté parent — jamais avant.
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, "remboursements");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const status = body?.status;
  const adminNote = body?.adminNote?.trim() || null;

  if (status && !STATUSES.includes(status)) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
  }

  const update = { admin_note: adminNote };
  if (status) {
    update.status = status;
    update.processed_at = status === "pending" ? null : new Date().toISOString();
    update.processed_by = status === "pending" ? null : auth.parent.id;
  }

  const { error } = await auth.admin
    .from("reimbursement_requests")
    .update(update)
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
