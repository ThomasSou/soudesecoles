import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../../lib/adminAuth";
import { urlSignee } from "../../../../../../lib/enseignantFichiers";

export const dynamic = "force-dynamic";

// URL signée (5 minutes) vers un RIB déposé par un enseignant.
export async function GET(request, { params }) {
  const auth = await requirePermission(request, "enseignants");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: rib, error } = await auth.admin
    .from("teacher_ribs")
    .select("rib_file_path")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !rib) return NextResponse.json({ error: "RIB introuvable." }, { status: 404 });

  const { url, error: urlError } = await urlSignee(auth.admin, rib.rib_file_path);
  if (urlError) return NextResponse.json({ error: urlError }, { status: 500 });
  return NextResponse.json({ ok: true, url });
}
