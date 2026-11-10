import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";
import { genererPdfFacture } from "../../../../../lib/facturePdf";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// PDF d'une facture (le jeton est envoyé dans l'en-tête : l'écran récupère le
// fichier avec fetch puis l'ouvre ou le télécharge).
export async function GET(request, { params }) {
  const auth = await requirePermission(request, "comptabilite");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: facture } = await auth.admin.from("factures_emises").select("*").eq("id", params.id).maybeSingle();
  if (!facture) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  const pdf = await genererPdfFacture(facture);
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${facture.numero_complet}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
