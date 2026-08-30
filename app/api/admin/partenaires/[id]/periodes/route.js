import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

const PERM = "avantages";
const NIVEAUX = ["or", "argent", "bronze"];

// POST : ajoute une période d'adhésion / de partenariat à un partenaire.
// Dates 100 % libres (aucun calage sur l'année scolaire). Le niveau est
// figé sur la période (liste fermée Or / Argent / Bronze).
// La liste est renvoyée par GET /api/admin/partenaires/[id].
export async function POST(request, { params }) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const debut = body?.debut;
  const fin = body?.fin;
  if (!debut || !fin) {
    return NextResponse.json({ error: "Dates de début et de fin obligatoires." }, { status: 400 });
  }
  if (fin < debut) {
    return NextResponse.json({ error: "La date de fin doit suivre la date de début." }, { status: 400 });
  }

  const niveau = body?.niveau?.trim() || null;
  if (niveau && !NIVEAUX.includes(niveau)) {
    return NextResponse.json({ error: "Niveau inconnu (Or, Argent ou Bronze)." }, { status: 400 });
  }

  const montant = body?.montantAnnonceEuros;
  const insert = {
    partenaire_id: params.id,
    debut,
    fin,
    niveau,
    montant_annonce_cents:
      montant === undefined || montant === null || montant === ""
        ? null
        : Math.round(Number(montant) * 100),
    note: body?.note?.trim() || null,
    created_by: auth.parent.id,
  };

  const { data, error } = await auth.admin
    .from("partenaire_periodes")
    .insert(insert)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, periode: data });
}
