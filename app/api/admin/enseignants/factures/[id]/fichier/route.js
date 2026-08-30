import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../../lib/adminAuth";
import { urlSignee } from "../../../../../../lib/enseignantFichiers";

export const dynamic = "force-dynamic";

// URL signée (5 minutes) vers la facture (?type=facture, défaut) ou vers son
// RIB (?type=rib). Le RIB peut être un fichier joint directement à la facture
// (rib_file_path) ou un RIB déjà déposé et réutilisé (rib_id → teacher_ribs).
export async function GET(request, { params }) {
  const auth = await requirePermission(request, "enseignants");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const type = new URL(request.url).searchParams.get("type") === "rib" ? "rib" : "facture";

  const { data: facture, error } = await auth.admin
    .from("teacher_invoices")
    .select("invoice_file_path, rib_id, rib_file_path")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !facture) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  let path = facture.invoice_file_path;
  if (type === "rib") {
    path = facture.rib_file_path;
    if (!path && facture.rib_id) {
      const { data: rib } = await auth.admin
        .from("teacher_ribs")
        .select("rib_file_path")
        .eq("id", facture.rib_id)
        .maybeSingle();
      path = rib?.rib_file_path || null;
    }
  }

  if (!path) {
    return NextResponse.json({ error: "Aucun fichier de ce type pour cette facture." }, { status: 404 });
  }

  const { url, error: urlError } = await urlSignee(auth.admin, path);
  if (urlError) return NextResponse.json({ error: urlError }, { status: 500 });
  return NextResponse.json({ ok: true, url });
}
