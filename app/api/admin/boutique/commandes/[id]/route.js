import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";
import { getCheckoutIntent, checkoutIntentIsPaid } from "../../../../../lib/helloasso";
import { confirmOrderIfPaid, libelleCommande } from "../../../../../lib/boutiqueOrders";
import { currentSchoolYear } from "../../../../../lib/anneeScolaire";
import { sendMail, CONTACT_EMAIL } from "../../../../../lib/mail";
import { SITE_URL } from "../../../../../lib/emailBlocks";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Charge la commande et vérifie qu'elle est bien « en attente » ET qu'elle n'a
// pas été réglée chez HelloAsso entre-temps (sans quoi on perdrait ou on
// doublerait une vraie vente). Renvoie { order } ou { reponse } (à renvoyer).
async function chargerCommandeEnAttente(admin, id) {
  const { data: order } = await admin.from("shop_orders").select("*").eq("id", id).maybeSingle();
  if (!order) return { reponse: NextResponse.json({ error: "Commande introuvable." }, { status: 404 }) };
  if (order.status !== "pending") {
    return {
      reponse: NextResponse.json({ error: "Seules les commandes en attente peuvent être modifiées ici." }, { status: 409 }),
    };
  }
  if (order.checkout_intent_id) {
    let intent;
    try {
      intent = await getCheckoutIntent(order.checkout_intent_id);
    } catch {
      return {
        reponse: NextResponse.json(
          { error: "Impossible de vérifier le paiement auprès de HelloAsso pour le moment. Réessayez dans un instant." },
          { status: 503 }
        ),
      };
    }
    if (checkoutIntentIsPaid(intent)) {
      await confirmOrderIfPaid(order.id);
      return {
        reponse: NextResponse.json(
          { error: "Cette commande a en fait été payée : elle vient d'être marquée « Payée »." },
          { status: 409 }
        ),
      };
    }
  }
  return { order };
}

// Supprime une commande EN ATTENTE (panier abandonné, erreur de saisie...).
// Une commande payée ne se supprime jamais ici. Garde-fou : une commande
// « en attente » peut en réalité avoir été réglée chez HelloAsso sans que le
// retour sur le site ait eu lieu ; on revérifie donc le paiement avant de
// supprimer, pour ne jamais perdre une vraie vente.
export async function DELETE(request, { params }) {
  const auth = await requirePermission(request, "boutique");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const garde = await chargerCommandeEnAttente(auth.admin, params.id);
  if (garde.reponse) return garde.reponse;
  const { order } = garde;

  const { error } = await auth.admin.from("shop_orders").delete().eq("id", order.id).eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

function echapper(t) {
  return String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// POST { action } sur une commande en attente :
// - "verifier"  : redemande à HelloAsso si elle est payée (et la passe en « Payée » si oui) ;
// - "relancer"  : e-mail à l'acheteur avec le récapitulatif et un lien de paiement ;
// - "marquer_payee" : encaissement hors HelloAsso (chèque ou espèces), avec note ;
// - "annuler"   : passe la commande en « annulée » (on garde la trace, contrairement à « supprimer »).
export async function POST(request, { params }) {
  const auth = await requirePermission(request, "boutique");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  if (!["verifier", "relancer", "annuler", "marquer_payee"].includes(action)) {
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  }

  if (action === "verifier") {
    const { data: avant } = await auth.admin.from("shop_orders").select("status").eq("id", params.id).maybeSingle();
    if (!avant) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
    const apres = await confirmOrderIfPaid(params.id);
    return NextResponse.json({ ok: true, status: apres?.status || avant.status, payee: apres?.status === "paid" });
  }

  const garde = await chargerCommandeEnAttente(auth.admin, params.id);
  if (garde.reponse) return garde.reponse;
  const { order } = garde;

  if (action === "annuler") {
    const { error } = await auth.admin
      .from("shop_orders")
      .update({ status: "cancelled" })
      .eq("id", order.id)
      .eq("status", "pending");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "marquer_payee") {
    const mode = body?.mode;
    if (!["cheque", "especes"].includes(mode)) {
      return NextResponse.json({ error: "Indiquez le mode de paiement (chèque ou espèces)." }, { status: 400 });
    }
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 200) : "";
    const maintenant = new Date().toISOString();
    const base = { status: "paid", paid_at: maintenant };
    let migrationManquante = false;
    let { data: prise, error } = await auth.admin
      .from("shop_orders")
      .update({ ...base, paiement_mode: mode, paiement_note: note || null })
      .eq("id", order.id)
      .eq("status", "pending")
      .select("id");
    if (error && /paiement_(mode|note)/i.test(error.message)) {
      // Migration 0058 pas encore passée : on enregistre quand même le paiement.
      migrationManquante = true;
      ({ data: prise, error } = await auth.admin
        .from("shop_orders")
        .update(base)
        .eq("id", order.id)
        .eq("status", "pending")
        .select("id"));
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!prise?.length) return NextResponse.json({ error: "Cette commande n'est plus en attente." }, { status: 409 });

    // Même historique d'achats pour la famille que pour un paiement HelloAsso.
    if (order.family_id) {
      await auth.admin.from("purchases").insert({
        family_id: order.family_id,
        school_year: currentSchoolYear(),
        label: libelleCommande(order.items),
        event_name: "Boutique",
        amount: order.total_cents / 100,
        payment_method: mode,
        purchased_at: maintenant,
      });
    }
    return NextResponse.json({ ok: true, migrationManquante });
  }

  // relancer
  const lien = `${SITE_URL}/api/boutique/reprendre?commande=${order.id}`;
  const lignes = (order.items || []).map((it) => `${it.qty}x ${it.name}${
    Array.isArray(it.options) && it.options.length > 0 ? ` (${it.options.map((o) => `${o.label} : ${o.value}`).join(", ")})` : ""
  }`);
  const total = (order.total_cents / 100).toFixed(2).replace(".", ",") + " €";
  const sujet = "Votre commande du Sou des Écoles est en attente de paiement";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
      <p style="font-size: 18px; font-weight: bold; color: #1F3864;">Sou des Écoles Montmerle-Lurcy</p>
      <p>Bonjour ${echapper(order.buyer_first_name)},</p>
      <p>Vous avez commencé une commande sur la boutique du Sou des Écoles, mais son paiement n'a pas été finalisé :</p>
      <ul>${lignes.map((l) => `<li>${echapper(l)}</li>`).join("")}</ul>
      <p style="font-weight: bold;">Total : ${total}</p>
      <p style="text-align: center; margin: 24px 0;">
        <a href="${lien}" style="background: #1F3864; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 999px; font-weight: bold;">Payer ma commande</a>
      </p>
      <p style="font-size: 13px; color: #64748b;">Le paiement est sécurisé (HelloAsso). Si vous ne souhaitez plus cette commande, ignorez simplement ce message. Une question ? Répondez à cet e-mail.</p>
    </div>`;
  const texte = [
    `Bonjour ${order.buyer_first_name},`,
    "",
    "Vous avez commencé une commande sur la boutique du Sou des Écoles, mais son paiement n'a pas été finalisé :",
    ...lignes.map((l) => `- ${l}`),
    `Total : ${total}`,
    "",
    `Payer ma commande : ${lien}`,
    "",
    "Si vous ne souhaitez plus cette commande, ignorez simplement ce message. Une question ? Répondez à cet e-mail.",
    "Le Sou des Écoles",
  ].join("\n");

  // SMTP en premier : fiable et rapide. Sender (circuit par défaut des envois
  // unitaires) répond lentement et pouvait faire dépasser le temps imparti.
  const mail = await sendMail({
    to: order.buyer_email,
    subject: sujet,
    html,
    text,
    replyTo: CONTACT_EMAIL,
    viaSmtpDabord: true,
  });
  if (!mail.sent) {
    return NextResponse.json({ error: "L'e-mail n'a pas pu être envoyé. Réessayez dans un instant." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
