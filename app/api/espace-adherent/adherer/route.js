import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { createCheckoutIntent, isHelloAssoConfigured } from "../../../lib/helloasso";
import { SITE_URL } from "../../../lib/emailBlocks";
import { currentSchoolYear } from "../../../lib/anneeScolaire";

const MONTANT_MIN = 17;

// Démarre le paiement en ligne de la cotisation pour la famille du parent
// connecté (montant libre à partir de 17€, ou l'une des 3 formules).
// Ouvert uniquement aux parents authentifiés (pas de visiteur anonyme ici,
// contrairement à la boutique : la cotisation est toujours rattachée à une
// famille identifiée).
export async function POST(request) {
  if (!isHelloAssoConfigured()) {
    return NextResponse.json(
      { error: "Le paiement en ligne n'est pas encore configuré. Merci de réessayer plus tard." },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  const { data: parent } = await admin
    .from("parents")
    .select("id, family_id, first_name, last_name, email")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (!parent?.family_id) {
    return NextResponse.json({ error: "Aucune famille rattachée à ce compte." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const amountEuros = Number(body?.amountEuros);
  if (!Number.isFinite(amountEuros) || amountEuros < MONTANT_MIN) {
    return NextResponse.json(
      { error: `Le montant de la cotisation est de ${MONTANT_MIN} € minimum.` },
      { status: 400 }
    );
  }

  const schoolYear = currentSchoolYear();
  const totalCents = Math.round(amountEuros * 100);

  let intent;
  try {
    intent = await createCheckoutIntent({
      totalCents,
      itemName: `Cotisation ${schoolYear} — Sou des Écoles Montmerle-Lurcy`,
      backUrl: `${SITE_URL}/espace-adherent`,
      errorUrl: `${SITE_URL}/espace-adherent?adhesion=erreur`,
      returnUrl: `${SITE_URL}/espace-adherent?adhesion=retour`,
      payer: {
        firstName: parent.first_name || "",
        lastName: parent.last_name || "",
        email: parent.email || "",
      },
      metadata: { familyId: parent.family_id, schoolYear, kind: "adhesion" },
    });
  } catch {
    return NextResponse.json(
      { error: "Le paiement en ligne n'est pas disponible pour le moment. Merci de réessayer plus tard." },
      { status: 502 }
    );
  }

  // Marque la cotisation "en cours de paiement" : `helloasso_payment_id`
  // porte temporairement l'identifiant de l'intention de paiement, avant
  // d'être remplacé par la confirmation réelle une fois le paiement vérifié.
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
