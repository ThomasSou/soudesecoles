import { NextResponse } from "next/server";
import { confirmEncaissementIfPaid } from "../../../lib/encaissementsLibres";

export const dynamic = "force-dynamic";

// Statut public d'un encaissement libre, consulté depuis la page de retour
// HelloAsso (paiement fait par un membre du bureau, ou par un parent depuis
// un lien reçu par e-mail — jamais de droit back-office requis ici). Ne
// renvoie que le strict nécessaire : jamais le nom du payeur, la famille, ni
// les autres encaissements.
export async function GET(request, { params }) {
  const encaissement = await confirmEncaissementIfPaid(params.id);
  if (!encaissement) {
    return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    status: encaissement.status,
    motif: encaissement.motif,
    montantCents: encaissement.montant_cents,
  });
}
