import { NextResponse } from "next/server";
import { resolvePartenaireSession } from "../../../lib/partenaires";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Factures émises par le Sou au partenaire connecté (identité déduite du
// jeton, jamais d'un identifiant envoyé par le navigateur). Les factures
// annulées ne sont pas montrées.
export async function GET(request) {
  const session = await resolvePartenaireSession(request);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });
  const { admin, partenaire } = session;

  const { data, error } = await admin
    .from("factures_emises")
    .select("id, numero_complet, type_piece, date_facture, objet, montant_cents, acquittee_le, moyen_paiement")
    .eq("partenaire_id", partenaire.id)
    .eq("statut", "emise")
    .order("date_facture", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, factures: data || [] });
}
