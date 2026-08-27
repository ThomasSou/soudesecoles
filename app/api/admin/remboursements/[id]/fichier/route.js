import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Fournit une URL signée (valable 5 minutes) vers la facture ou le RIB
// d'une demande. Le bucket "remboursements" est privé : c'est la seule
// façon d'y accéder, pas d'URL publique comme pour les images boutique.
export async function GET(request, { params }) {
  const auth = await requirePermission(request, "remboursements");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const type = new URL(request.url).searchParams.get("type") === "rib" ? "rib" : "facture";

  const { data: demande, error: fetchError } = await auth.admin
    .from("reimbursement_requests")
    .select("invoice_path, rib_path")
    .eq("id", params.id)
    .maybeSingle();

  if (fetchError || !demande) {
    return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
  }

  const path = type === "rib" ? demande.rib_path : demande.invoice_path;
  if (!path) {
    return NextResponse.json({ error: "Aucun fichier de ce type pour cette demande." }, { status: 404 });
  }

  const { data, error } = await auth.admin.storage
    .from("remboursements")
    .createSignedUrl(path, 300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, url: data.signedUrl });
}
