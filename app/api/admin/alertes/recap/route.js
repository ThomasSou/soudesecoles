import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabaseServerAdmin";
import { compterAlertes } from "../../../../lib/alertes";
import { CONTACT_EMAIL, isMailConfigured, sendMail } from "../../../../lib/mail";
import { SITE_URL } from "../../../../lib/emailBlocks";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const TOUS_LES_DROITS = {
  demandes: true,
  messages: true,
  enseignants: true,
  remboursements: true,
};

// Récapitulatif quotidien : envoyé UNIQUEMENT s'il y a quelque chose à
// traiter, à la boîte du Sou (CONTACT_EMAIL). Déclenché chaque matin par la
// fonction planifiée Netlify netlify/functions/recap-quotidien.mjs avec le
// jeton de service (en-tête x-admin-token = ADMIN_IMPORT_TOKEN).
export async function POST(request) {
  const jeton = request.headers.get("x-admin-token");
  if (!jeton || jeton !== process.env.ADMIN_IMPORT_TOKEN) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isMailConfigured()) {
    return NextResponse.json({ error: "Envoi non configuré." }, { status: 503 });
  }

  const a = await compterAlertes(createAdminClient(), TOUS_LES_DROITS);
  const lignes = [
    [a.demandes, "demande(s) d'inscription à valider", "/admin/demandes"],
    [a.messages, "message(s) reçu(s) non traité(s)", "/admin/messages"],
    [a.devis, "devis d'enseignant à valider", "/admin/enseignants"],
    [a.factures, "facture(s) d'enseignant à rembourser", "/admin/enseignants"],
    [a.remboursements, "demande(s) de remboursement de parents", "/admin/remboursements"],
  ].filter(([n]) => n > 0);

  if (lignes.length === 0) {
    return NextResponse.json({ ok: true, envoye: false });
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1e293b;">
      <p style="font-size: 18px; font-weight: bold; color: #0b3d91;">Sou des Écoles — à traiter</p>
      <p>Bonjour, voici ce qui attend le bureau dans le back-office :</p>
      <ul style="line-height: 1.8;">
        ${lignes
          .map(([n, texte, chemin]) => `<li><a href="${SITE_URL}${chemin}" style="color:#0b3d91;"><strong>${n}</strong> ${texte}</a></li>`)
          .join("")}
      </ul>
      <p style="font-size: 13px; color: #64748b;">Ce récapitulatif n'est envoyé que lorsqu'il y a quelque chose à traiter.</p>
    </div>`;
  const text =
    "Ce qui attend le bureau dans le back-office :\n\n" +
    lignes.map(([n, texte, chemin]) => `- ${n} ${texte} : ${SITE_URL}${chemin}`).join("\n");

  const total = lignes.reduce((s, [n]) => s + n, 0);
  const res = await sendMail({
    to: CONTACT_EMAIL,
    subject: `Sou des Écoles : ${total} élément(s) à traiter dans le back-office`,
    text,
    html,
  });
  return NextResponse.json({ ok: true, envoye: Boolean(res.sent) });
}
