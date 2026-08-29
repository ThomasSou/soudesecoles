import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../../lib/adminAuth";
import { urlSignee } from "../../../../../../lib/enseignantFichiers";

export const dynamic = "force-dynamic";

// URL signée (5 minutes) vers le fichier du devis. Le bucket
// `remboursements` est privé : c'est la seule façon d'y accéder.
export async function GET(request, { params }) {
  const auth = await requirePermission(request, "enseignants");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: devis, error } = await auth.admin
    .from("teacher_quotes")
    .select("quote_file_path")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !devis) return NextResponse.json({ error: "Devis introuvable." }, { status: 404 });

  const { url, error: urlError } = await urlSignee(auth.admin, devis.quote_file_path);
  if (urlError) return NextResponse.json({ error: urlError }, { status: 500 });
  return NextResponse.json({ ok: true, url });
}
