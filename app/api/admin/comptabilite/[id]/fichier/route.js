import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";
import { urlSignee } from "../../../../../lib/comptaFichiers";

export const dynamic = "force-dynamic";

// URL signée (5 minutes) vers le justificatif d'une ligne de compta. Le
// bucket `remboursements` est privé : c'est la seule façon d'y accéder.
//
// Priorité : le fichier propre à la ligne ; à défaut, pour une ligne
// recopiée d'une facture enseignant, le fichier de cette facture.
export async function GET(request, { params }) {
  const auth = await requirePermission(request, "comptabilite");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: ligne, error } = await auth.admin
    .from("compta_lignes")
    .select("justificatif_path, teacher_invoice_id")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !ligne) return NextResponse.json({ error: "Ligne introuvable." }, { status: 404 });

  let path = ligne.justificatif_path;
  if (!path && ligne.teacher_invoice_id) {
    const { data: facture } = await auth.admin
      .from("teacher_invoices")
      .select("invoice_file_path")
      .eq("id", ligne.teacher_invoice_id)
      .maybeSingle();
    path = facture?.invoice_file_path || null;
  }

  if (!path) return NextResponse.json({ error: "Aucun justificatif pour cette ligne." }, { status: 404 });

  const { url, error: urlError } = await urlSignee(auth.admin, path);
  if (urlError) return NextResponse.json({ error: urlError }, { status: 500 });
  return NextResponse.json({ ok: true, url });
}
