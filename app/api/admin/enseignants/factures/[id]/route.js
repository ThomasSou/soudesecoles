import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

const STATUSES = ["soumise", "remboursee"];

// Le bureau marque une facture « remboursée » (le virement lui-même reste
// manuel : ce statut ne fait que suivre l'état) ou la remet en « soumise » ;
// et/ou modifie la note interne.
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, "enseignants");
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
    update.reimbursed_at = status === "remboursee" ? new Date().toISOString() : null;
    update.reimbursed_by = status === "remboursee" ? auth.parent.id : null;
  }

  const { error } = await auth.admin.from("teacher_invoices").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
