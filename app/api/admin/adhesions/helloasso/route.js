import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { createCheckoutIntent, isHelloAssoConfigured } from "../../../../lib/helloasso";
import { SITE_URL } from "../../../../lib/emailBlocks";
import { currentSchoolYear } from "../../../../lib/anneeScolaire";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MONTANT_MIN = 17;

// Démarre un paiement HelloAsso de la cotisation POUR une famille, depuis la
// fiche famille du back-office (ex. un parent présent à la permanence qui
// règle sur le téléphone ou l'ordinateur du bureau). Même mécanique que le
// paiement depuis l'espace adhérent (/api/espace-adherent/adherer), mais
// déclenché par le bureau : on renvoie l'adresse de la page de paiement
// HelloAsso où le navigateur est redirigé. L'adhésion n'est confirmée qu'une
// fois le paiement vérifié auprès de HelloAsso (webhook, ou bouton de retour
// → /confirmer), jamais sur la seule foi de cette requête.
export async function POST(request) {
  const auth = await requirePermission(request, "familles");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isHelloAssoConfigured()) {
    return NextResponse.json({ error: "Le paiement en ligne n'est pas encore configuré." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const familyId = body?.familyId;
  const amountEuros = Number(String(body?.amountEuros ?? "").replace(",", "."));
  if (!familyId) {
    return NextResponse.json({ error: "Famille manquante." }, { status: 400 });
  }
  if (!Number.isFinite(amountEuros) || amountEuros < MONTANT_MIN) {
    return NextResponse.json(
      { error: `Le montant de la cotisation est de ${MONTANT_MIN} € minimum.` },
      { status: 400 }
    );
  }

  const admin = auth.admin;
  const schoolYear = currentSchoolYear();

  const { data: existante } = await admin
    .from("memberships")
    .select("paid_at")
    .eq("family_id", familyId)
    .eq("school_year", schoolYear)
    .maybeSingle();
  if (existante?.paid_at) {
    return NextResponse.json({ error: "La cotisation de cette famille est déjà payée." }, { status: 409 });
  }

  // Payeur : le premier parent de la famille (prioritairement un avec une
  // adresse e-mail), pour que HelloAsso y envoie le reçu.
  const { data: parents } = await admin
    .from("parents")
    .select("first_name, last_name, email")
    .eq("family_id", familyId);
  const payeur = (parents || []).find((p) => p.email) || (parents || [])[0] || {};

  let intent;
  try {
    intent = await createCheckoutIntent({
      totalCents: Math.round(amountEuros * 100),
      itemName: `Cotisation ${schoolYear} — Sou des Écoles Montmerle-Lurcy`,
      backUrl: `${SITE_URL}/admin/familles`,
      errorUrl: `${SITE_URL}/admin/familles?cotisation=erreur`,
      returnUrl: `${SITE_URL}/admin/familles?cotisation=retour&famille=${familyId}`,
      payer: {
        firstName: payeur.first_name || "",
        lastName: payeur.last_name || "",
        email: payeur.email || "",
      },
      metadata: { familyId, schoolYear, kind: "adhesion" },
    });
  } catch {
    return NextResponse.json(
      { error: "Le paiement en ligne n'est pas disponible pour le moment. Réessayez dans un instant." },
      { status: 502 }
    );
  }

  await admin.from("memberships").upsert(
    {
      family_id: familyId,
      school_year: schoolYear,
      amount: amountEuros,
      paid_at: null,
      payment_method: null,
      helloasso_payment_id: intent.id,
    },
    { onConflict: "family_id,school_year" }
  );

  return NextResponse.json({ ok: true, redirectUrl: intent.redirectUrl });
}
