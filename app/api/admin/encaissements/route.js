import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import { createCheckoutIntent, isHelloAssoConfigured } from "../../../lib/helloasso";
import { envoyerEmailTransactionnel, isSenderConfigured } from "../../../lib/senderMail";
import { SITE_URL } from "../../../lib/emailBlocks";

export const dynamic = "force-dynamic";

function formatMontant(cents) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function gabaritDemandePaiement({ prenom, motif, montantCents, lien }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
      <p style="font-size: 18px; font-weight: bold; color: #0b3d91;">Sou des Écoles Montmerle-Lurcy</p>
      <p>Bonjour ${prenom},</p>
      <p>Le Sou des Écoles vous invite à régler en ligne :</p>
      <p style="font-size: 20px; font-weight: bold; margin: 12px 0;">${formatMontant(montantCents)} — ${motif}</p>
      <p style="text-align: center; margin: 28px 0;">
        <a href="${lien}" style="background: #0b3d91; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: bold;">
          Payer en ligne
        </a>
      </p>
      <p style="font-size: 13px; color: #64748b;">Paiement sécurisé par carte bancaire via HelloAsso. Si vous n'êtes pas concerné par cette demande, contactez-nous.</p>
    </div>
  `;
}

// GET : liste des encaissements libres (le plus récent d'abord).
// POST : crée un encaissement libre + une intention de paiement HelloAsso.
// Deux modes :
// - "maintenant" (par défaut) : redirection pleine page immédiate, pour un
//   membre du bureau qui règle lui-même (HelloAsso refuse d'être affiché en
//   iframe, comme la boutique et les cotisations).
// - "email" : le lien de paiement est envoyé par e-mail (via Sender) au
//   parent choisi, qui règle ensuite de son côté avec sa propre carte.
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
  const mode = body?.mode === "email" ? "email" : "maintenant";
  const prenom = body?.prenom?.trim();
  const nomFamille = body?.nom?.trim();
  const motif = body?.motif?.trim();
  const montant = Number(body?.montant);
  const familyId = body?.familyId || null;
  const parentEmail = body?.parentEmail?.trim() || null;

  if (!prenom || !nomFamille || !motif) {
    return NextResponse.json({ error: "Prénom, nom et motif sont obligatoires." }, { status: 400 });
  }
  if (!Number.isFinite(montant) || montant <= 0) {
    return NextResponse.json({ error: "Le montant doit être supérieur à 0." }, { status: 400 });
  }
  if (mode === "email") {
    if (!parentEmail) {
      return NextResponse.json({ error: "Choisissez le parent qui recevra la demande." }, { status: 400 });
    }
    if (!isSenderConfigured()) {
      return NextResponse.json({ error: "L'envoi par e-mail n'est pas configuré." }, { status: 503 });
    }
  }

  const montantCents = Math.round(montant * 100);
  const nomComplet = `${prenom} ${nomFamille}`;

  const { data: encaissement, error: insertError } = await auth.admin
    .from("encaissements_libres")
    .insert({
      nom: nomComplet,
      motif,
      montant_cents: montantCents,
      created_by: auth.parent.id,
      family_id: familyId,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Page de retour publique (pas le back-office) : un parent qui règle via
  // un lien reçu par e-mail n'a pas de droit "encaissements".
  let intent;
  try {
    intent = await createCheckoutIntent({
      totalCents: montantCents,
      itemName: `${motif} — ${nomComplet}`.slice(0, 250),
      backUrl: `${SITE_URL}/paiement/${encaissement.id}`,
      errorUrl: `${SITE_URL}/paiement/${encaissement.id}?statut=erreur`,
      returnUrl: `${SITE_URL}/paiement/${encaissement.id}?statut=retour`,
      payer: { firstName: prenom, lastName: nomFamille, email: parentEmail || "contact@sou-montmerle.fr" },
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

  if (mode === "email") {
    try {
      await envoyerEmailTransactionnel({
        to: parentEmail,
        toName: prenom,
        subject: `Demande de paiement — ${motif}`,
        html: gabaritDemandePaiement({ prenom, motif, montantCents, lien: intent.redirectUrl }),
        text: `Bonjour ${prenom},\n\nLe Sou des Écoles vous invite à régler ${formatMontant(montantCents)} : ${motif}.\n\nPour payer en ligne par carte : ${intent.redirectUrl}`,
      });
    } catch (err) {
      return NextResponse.json(
        { error: `Le paiement a été créé mais l'e-mail n'a pas pu être envoyé : ${err.message}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, id: encaissement.id, envoye: true });
  }

  return NextResponse.json({ ok: true, id: encaissement.id, redirectUrl: intent.redirectUrl });
}
