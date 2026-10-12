import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { createCheckoutIntent, isHelloAssoConfigured } from "../../../lib/helloasso";
import { SITE_URL } from "../../../lib/emailBlocks";
import { currentSchoolYear } from "../../../lib/anneeScolaire";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MONTANT_MIN = 17;

// Paiement de la cotisation SANS compte de connexion : pour les parents qui
// n'ont pas (encore) activé leur espace famille. La famille est retrouvée par
// l'adresse e-mail connue du Sou ; le paiement passe ensuite par la même
// mécanique que l'espace adhérent (HelloAsso en pleine page, confirmation
// vérifiée auprès de HelloAsso par le webhook ou au retour).
export async function POST(request) {
  if (!isHelloAssoConfigured()) {
    return NextResponse.json(
      { error: "Le paiement en ligne n'est pas disponible pour le moment. Merci de réessayer plus tard." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const amountEuros = Number(String(body?.amountEuros ?? "").replace(",", "."));

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Merci d'indiquer une adresse e-mail valide." }, { status: 400 });
  }
  if (!Number.isFinite(amountEuros) || amountEuros < MONTANT_MIN) {
    return NextResponse.json(
      { error: `Le montant de la cotisation est de ${MONTANT_MIN} € minimum.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: parent } = await admin
    .from("parents")
    .select("id, family_id, first_name, last_name, email")
    .ilike("email", email)
    .not("family_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!parent) {
    return NextResponse.json(
      {
        error:
          "Nous ne retrouvons pas cette adresse e-mail. Essayez l'adresse que vous avez donnée à l'école, ou écrivez-nous depuis la page Contact : nous vous aiderons.",
      },
      { status: 404 }
    );
  }

  const schoolYear = currentSchoolYear();
  const { data: existante } = await admin
    .from("memberships")
    .select("paid_at")
    .eq("family_id", parent.family_id)
    .eq("school_year", schoolYear)
    .maybeSingle();
  if (existante?.paid_at) {
    return NextResponse.json(
      { error: `Bonne nouvelle : la cotisation ${schoolYear} de votre famille est déjà réglée. Merci !` },
      { status: 409 }
    );
  }

  let intent;
  try {
    intent = await createCheckoutIntent({
      totalCents: Math.round(amountEuros * 100),
      itemName: `Cotisation ${schoolYear} — Sou des Écoles Montmerle-Lurcy`,
      backUrl: `${SITE_URL}/cotisation`,
      errorUrl: `${SITE_URL}/cotisation?statut=erreur`,
      returnUrl: `${SITE_URL}/cotisation?statut=retour&f=${parent.family_id}`,
      payer: {
        firstName: parent.first_name || "",
        lastName: parent.last_name || "",
        email: parent.email || email,
      },
      metadata: { familyId: parent.family_id, schoolYear, kind: "adhesion" },
    });
  } catch {
    return NextResponse.json(
      { error: "Le paiement en ligne n'est pas disponible pour le moment. Merci de réessayer plus tard." },
      { status: 502 }
    );
  }

  await admin.from("memberships").upsert(
    {
      family_id: parent.family_id,
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
