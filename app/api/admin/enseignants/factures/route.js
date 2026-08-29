import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Toutes les factures déposées par les enseignants, avec le nom de
// l'enseignant, les classes concernées, et l'indication d'un RIB joint
// (fichier direct ou RIB réutilisé).
export async function GET(request) {
  const auth = await requirePermission(request, "enseignants");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("teacher_invoices")
    .select(
      "id, teacher_id, quote_id, label, supplier_name, description, amount_cents, school_year, status, invoice_file_path, rib_id, rib_file_path, admin_note, created_at, reimbursed_at, reimbursed_by"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const teacherIds = [...new Set((data || []).map((f) => f.teacher_id))];
  const invoiceIds = (data || []).map((f) => f.id);

  const [{ data: teachers }, { data: liens }] = await Promise.all([
    teacherIds.length
      ? auth.admin.from("teachers").select("id, first_name, last_name, email, role").in("id", teacherIds)
      : Promise.resolve({ data: [] }),
    invoiceIds.length
      ? auth.admin
          .from("teacher_invoice_classes")
          .select("invoice_id, class_label")
          .in("invoice_id", invoiceIds)
      : Promise.resolve({ data: [] }),
  ]);

  const teacherById = Object.fromEntries((teachers || []).map((t) => [t.id, t]));
  const classesParFacture = {};
  for (const l of liens || []) (classesParFacture[l.invoice_id] ||= []).push(l.class_label);

  const factures = (data || []).map((f) => ({
    ...f,
    teacher: teacherById[f.teacher_id] || null,
    classes: classesParFacture[f.id] || [],
    a_rib: Boolean(f.rib_id || f.rib_file_path),
  }));

  return NextResponse.json({ ok: true, factures });
}
