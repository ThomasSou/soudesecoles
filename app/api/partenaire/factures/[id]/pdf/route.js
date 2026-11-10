import { NextResponse } from "next/server";
import { resolvePartenaireSession } from "../../../../../lib/partenaires";
import { genererPdfFacture } from "../../../../../lib/facturePdf";
import { chargerSignature } from "../../../../../lib/facturesEmises";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// PDF d'une facture du partenaire connecté (et d'aucun autre).
export async function GET(request, { params }) {
  const session = await resolvePartenaireSession(request);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });
  const { admin, partenaire } = session;

  const { data: facture } = await admin
    .from("factures_emises")
    .select("*")
    .eq("id", params.id)
    .eq("partenaire_id", partenaire.id)
    .eq("statut", "emise")
    .maybeSingle();
  if (!facture) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  const pdf = await genererPdfFacture(facture, { signature: await chargerSignature(admin) });
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${facture.numero_complet}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
