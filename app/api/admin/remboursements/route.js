import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Liste de toutes les demandes de remboursement, la plus récente d'abord,
// avec le nom de la famille et du parent pour l'affichage back-office.
export async function GET(request) {
  const auth = await requirePermission(request, "remboursements");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("reimbursement_requests")
    .select(
      "id, family_id, parent_id, category, event_name, description, amount_cents, invoice_path, rib_path, status, admin_note, created_at, processed_at"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const parentIds = [...new Set((data || []).map((d) => d.parent_id))];
  const { data: parents } = parentIds.length
    ? await auth.admin.from("parents").select("id, first_name, last_name, email").in("id", parentIds)
    : { data: [] };
  const parentsById = Object.fromEntries((parents || []).map((p) => [p.id, p]));

  const demandes = (data || []).map((d) => ({
    ...d,
    parent: parentsById[d.parent_id] || null,
  }));

  return NextResponse.json({ ok: true, demandes });
}
