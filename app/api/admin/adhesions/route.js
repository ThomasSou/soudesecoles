import { NextResponse } from "next/server";
import { requireAdmin } from "../../../lib/adminAuth";

// Enregistre (ou met à jour) la cotisation d'une famille pour une année
// scolaire donnée. Permet au bureau d'encaisser un chèque/espèces lors des
// permanences ou manifestations sans passer par la base directement.
export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { familyId, schoolYear, amount, paid, paymentMethod, note } =
    await request.json();

  if (!familyId || !schoolYear) {
    return NextResponse.json(
      { error: "Famille et année scolaire obligatoires." },
      { status: 400 }
    );
  }

  const { error } = await auth.admin.from("memberships").upsert(
    {
      family_id: familyId,
      school_year: schoolYear,
      amount: paid && amount != null ? Number(amount) : null,
      paid_at: paid ? new Date().toISOString() : null,
      payment_method: paid ? paymentMethod || null : null,
      note: paid ? note?.trim() || null : null,
    },
    { onConflict: "family_id,school_year" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Le champ status_current_year reste synchronisé pour compatibilité, mais
  // l'affichage se base désormais sur l'existence d'une adhésion payée pour
  // l'année en cours (cf. app/lib/anneeScolaire.js).
  await auth.admin
    .from("families")
    .update({ status_current_year: paid ? "adherent" : "non_adherent" })
    .eq("id", familyId);

  return NextResponse.json({ ok: true });
}
