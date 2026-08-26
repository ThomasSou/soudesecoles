import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import { createCheckoutIntent, isHelloAssoConfigured } from "../../../lib/helloasso";
import { SITE_URL } from "../../../lib/emailBlocks";

export const dynamic = "force-dynamic";

// GET : liste des encaissements libres (le plus récent d'abord).
// POST : crée un encaissement libre + une intention de paiement HelloAsso,
// et renvoie l'URL de paiement (redirection pleine page, comme la boutique
// et les cotisations — HelloAsso refuse d'être affiché en iframe).
export async function GET(request) {
  const auth = await requirePermission(request, "encaissements");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("encaissements_libres")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, encaissements: data || [] });
}

export async function POST(request) {
  const auth = await requirePermission(request, "encaissements");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!isHelloAssoConfigured()) {
    return NextResponse.json(
      { error: "Le paiement en ligne n'est pas configuré." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const prenom = body?.prenom?.trim();
  const nomFamille = body?.nom?.trim();
  const motif = body?.motif?.trim();
  const montant = Number(body?.montant);

  if (!prenom || !nomFamille || !motif) {
    return NextResponse.json({ error: "Prénom, nom et motif sont obligatoires." }, { status: 400 });
  }
  if (!Number.isFinite(montant) || montant <= 0) {
    return NextResponse.json({ error: "Le montant doit être supérieur à 0." }, { status: 400 });
  }

  const montantCents = Math.round(montant * 100);
  const nomComplet = `${prenom} ${nomFamille}`;

  const { data: encaissement, error: insertError } = await auth.admin
    .from("encaissements_libres")
    .insert({ nom: nomComplet, motif, montant_cents: montantCents, created_by: auth.parent.id })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  let intent;
  try {
    intent = await createCheckoutIntent({
      totalCents: montantCents,
      itemName: `${motif} — ${nomComplet}`.slice(0, 250),
      backUrl: `${SITE_URL}/admin/encaissements`,
      errorUrl: `${SITE_URL}/admin/encaissements?id=${encaissement.id}&statut=erreur`,
      returnUrl: `${SITE_URL}/admin/encaissements?id=${encaissement.id}&statut=retour`,
      payer: { firstName: prenom, lastName: nomFamille, email: "contact@sou-montmerle.fr" },
      metadata: { encaissementId: encaissement.id },
    });
  } catch (err) {
    await auth.admin.from("encaissements_libres").update({ status: "failed" }).eq("id", encaissement.id);
    return NextResponse.json(
      { error: "Le paiement en ligne n'est pas disponible pour le moment. Merci de réessayer plus tard." },
      { status: 502 }
    );
  }

  await auth.admin
    .from("encaissements_libres")
    .update({ checkout_intent_id: intent.id })
    .eq("id", encaissement.id);

  return NextResponse.json({ ok: true, id: encaissement.id, redirectUrl: intent.redirectUrl });
}
