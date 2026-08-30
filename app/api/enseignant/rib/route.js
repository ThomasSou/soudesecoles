import { NextResponse } from "next/server";
import { requireEnseignant } from "../../../lib/enseignantAuth";
import { televerserFichier } from "../../../lib/enseignantFichiers";

export const dynamic = "force-dynamic";

// Liste des RIB déposés par l'enseignant connecté. On ne renvoie jamais le
// contenu du fichier ni d'URL : juste le libellé et la date. La consultation
// se fait par le bureau via une URL signée.
export async function GET(request) {
  const auth = await requireEnseignant(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("teacher_ribs")
    .select("id, label, created_at, purged_at")
    .eq("teacher_id", auth.teacher.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ribs: data || [] });
}

// Dépôt d'un RIB EN FICHIER uniquement (PDF ou photo) — aucune saisie
// IBAN/BIC, pour éviter les erreurs de frappe.
export async function POST(request) {
  const auth = await requireEnseignant(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const label = body?.label?.trim() || null;

  const { path, error: uploadError } = await televerserFichier(auth.admin, {
    teacherId: auth.teacher.id,
    kind: "rib",
    dataUrl: body?.ribFileDataUrl,
  });
  if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });

  const { data: rib, error: insertError } = await auth.admin
    .from("teacher_ribs")
    .insert({ teacher_id: auth.teacher.id, label, rib_file_path: path })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: rib.id });
}
