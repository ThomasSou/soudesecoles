import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Tous les devis déposés par les enseignants, le plus récent d'abord, avec
// le nom de l'enseignant et les classes concernées, pour l'affichage
// back-office (permission « enseignants »).
export async function GET(request) {
  const auth = await requirePermission(request, "enseignants");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("teacher_quotes")
    .select(
      "id, teacher_id, title, description, amount_cents, school_year, status, quote_file_path, admin_note, created_at, decided_at, decided_by"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const teacherIds = [...new Set((data || []).map((d) => d.teacher_id))];
  const quoteIds = (data || []).map((d) => d.id);

  const [{ data: teachers }, { data: liens }] = await Promise.all([
    teacherIds.length
      ? auth.admin.from("teachers").select("id, first_name, last_name, email, role").in("id", teacherIds)
      : Promise.resolve({ data: [] }),
    quoteIds.length
      ? auth.admin.from("teacher_quote_classes").select("quote_id, class_label").in("quote_id", quoteIds)
      : Promise.resolve({ data: [] }),
  ]);

  const teacherById = Object.fromEntries((teachers || []).map((t) => [t.id, t]));
  const classesParDevis = {};
  for (const l of liens || []) (classesParDevis[l.quote_id] ||= []).push(l.class_label);

  const devis = (data || []).map((d) => ({
    ...d,
    teacher: teacherById[d.teacher_id] || null,
    classes: classesParDevis[d.id] || [],
  }));

  return NextResponse.json({ ok: true, devis });
}
