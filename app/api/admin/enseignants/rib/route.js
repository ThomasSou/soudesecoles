import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Tous les RIB déposés par les enseignants (données sensibles : jamais de
// contenu ni d'URL ici, juste le libellé, la date et l'enseignant ; la
// consultation passe par une URL signée de courte durée).
export async function GET(request) {
  const auth = await requirePermission(request, "enseignants");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("teacher_ribs")
    .select("id, teacher_id, label, created_at, purged_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const teacherIds = [...new Set((data || []).map((r) => r.teacher_id))];
  const { data: teachers } = teacherIds.length
    ? await auth.admin.from("teachers").select("id, first_name, last_name, email, role").in("id", teacherIds)
    : { data: [] };
  const teacherById = Object.fromEntries((teachers || []).map((t) => [t.id, t]));

  const ribs = (data || []).map((r) => ({ ...r, teacher: teacherById[r.teacher_id] || null }));
  return NextResponse.json({ ok: true, ribs });
}
