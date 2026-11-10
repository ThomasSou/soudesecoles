// Génère le PDF d'une facture émise par le Sou (pdf-lib : bibliothèque PDF
// sans dépendance, ajoutée pour cet export). Polices standard (WinAnsi) :
// accents français et « € » pris en charge, tout autre caractère est remplacé.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { SITE_URL } from "./emailBlocks";
import { SOU, MOYENS_FACTURE, adresseClient } from "./facturesEmises";

const BLEU = rgb(0.122, 0.22, 0.392); // #1F3864
const GRIS = rgb(0.39, 0.45, 0.55);
const NOIR = rgb(0.12, 0.16, 0.23);

function dateFr(iso) {
  if (!iso) return "";
  const [a, m, j] = String(iso).slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

// 1 234,50 € avec espaces ordinaires (l'espace fine insécable d'Intl n'existe pas en WinAnsi).
export function montantTexte(cents) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const entier = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const dec = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}${entier},${dec} €`;
}

async function imageDistante(chemin) {
  try {
    const res = await fetch(`${SITE_URL}${chemin}`, { cache: "no-store" });
    if (!res.ok || !/image\/png/i.test(res.headers.get("content-type") || "")) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function genererPdfFacture(f) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${f.numero_complet} — ${SOU.nom}`);
  doc.setAuthor(SOU.nom);
  const page = doc.addPage([595.28, 841.89]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const jeu = new Set(normal.getCharacterSet());
  const sur = (t) =>
    Array.from(String(t ?? "").replace(/[  ]/g, " ").replace(/[\r\n\t]+/g, " "))
      .map((c) => (jeu.has(c.codePointAt(0)) ? c : "?"))
      .join("");

  const G = 50;
  const L = 595.28 - 2 * G;
  let y = 841.89 - G;

  const ecrire = (t, x, yy, { font = normal, size = 10, color = NOIR } = {}) =>
    page.drawText(sur(t), { x, y: yy, font, size, color });
  const ecrireDroite = (t, xDroit, yy, opts = {}) => {
    const font = opts.font || normal;
    const size = opts.size || 10;
    ecrire(t, xDroit - font.widthOfTextAtSize(sur(t), size), yy, opts);
  };
  const lignes = (t, font, size, largeur) => {
    const mots = sur(t).split(" ");
    const out = [];
    let cur = "";
    for (const m of mots) {
      const essai = cur ? `${cur} ${m}` : m;
      if (font.widthOfTextAtSize(essai, size) > largeur && cur) {
        out.push(cur);
        cur = m;
      } else cur = essai;
    }
    if (cur) out.push(cur);
    return out;
  };

  // En-tête : logo + titre.
  const logo = await imageDistante("/logo/logo.png");
  if (logo) {
    const img = await doc.embedPng(logo);
    page.drawImage(img, { x: G, y: y - 70, width: 70, height: 70 });
  }
  const titre = f.type_piece === "recu" ? "REÇU" : "FACTURE ACQUITTÉE";
  ecrireDroite(titre, G + L, y - 22, { font: gras, size: 20, color: BLEU });
  ecrireDroite(`N° ${f.numero_complet}`, G + L, y - 42, { font: gras, size: 12 });
  ecrireDroite(`${SOU.ville}, le ${dateFr(f.date_facture)}`, G + L, y - 58, { size: 10, color: GRIS });
  y -= 100;

  // Émetteur (gauche) et client (droite).
  const colD = G + L / 2 + 10;
  ecrire("ÉMETTEUR", G, y, { font: gras, size: 8, color: GRIS });
  ecrire("CLIENT", colD, y, { font: gras, size: 8, color: GRIS });
  let yg = y - 16;
  ecrire(SOU.nom, G, yg, { font: gras, size: 11 });
  for (const t of [SOU.adresse, `${SOU.codePostal} ${SOU.ville}`, `SIRET ${SOU.siret}`, `RNA ${SOU.rna}`]) {
    yg -= 14;
    ecrire(t, G, yg, { size: 10 });
  }
  let yd = y - 16;
  const nomClient = [f.client_raison_sociale, f.client_forme].filter(Boolean).join(" — ");
  for (const t of lignes(nomClient, gras, 11, L / 2 - 10)) {
    ecrire(t, colD, yd, { font: gras, size: 11 });
    yd -= 14;
  }
  const adr = adresseClient(f);
  if (adr) {
    for (const t of lignes(adr, normal, 10, L / 2 - 10)) {
      ecrire(t, colD, yd, { size: 10 });
      yd -= 14;
    }
  }
  if (f.client_siren) {
    ecrire(`SIREN ${f.client_siren.replace(/(\d{3})(?=\d)/g, "$1 ")}`, colD, yd, { size: 10 });
    yd -= 14;
  }
  y = Math.min(yg, yd) - 30;

  // Désignation / montant.
  page.drawRectangle({ x: G, y: y - 6, width: L, height: 22, color: rgb(0.94, 0.96, 0.98) });
  ecrire("Désignation", G + 8, y, { font: gras, size: 10, color: BLEU });
  ecrireDroite("Montant", G + L - 8, y, { font: gras, size: 10, color: BLEU });
  y -= 26;
  const lignesObjet = lignes(f.objet, normal, 11, L - 130);
  const ligneY0 = y;
  for (const t of lignesObjet) {
    ecrire(t, G + 8, y, { size: 11 });
    y -= 15;
  }
  ecrireDroite(montantTexte(f.montant_cents), G + L - 8, ligneY0, { size: 11 });
  y -= 6;
  page.drawLine({ start: { x: G, y }, end: { x: G + L, y }, thickness: 0.6, color: rgb(0.8, 0.84, 0.88) });
  y -= 22;
  ecrireDroite("Total", G + L - 120, y, { font: gras, size: 12 });
  ecrireDroite(montantTexte(f.montant_cents), G + L - 8, y, { font: gras, size: 12 });
  y -= 16;
  ecrireDroite("Reste à payer", G + L - 120, y, { size: 10, color: GRIS });
  ecrireDroite(montantTexte(0), G + L - 8, y, { size: 10, color: GRIS });
  y -= 34;

  // Mentions.
  const mentions = [
    SOU.mentionTva + ".",
    `Acquittée le ${dateFr(f.acquittee_le)} par ${MOYENS_FACTURE[f.moyen_paiement] || f.moyen_paiement}${
      f.paiement_reference ? ` (${f.paiement_reference})` : ""
    }.`,
  ];
  if (f.don_associe_cents) {
    mentions.push(
      `Le don de ${montantTexte(f.don_associe_cents)} versé séparément par le client fait l'objet d'un reçu fiscal (Cerfa n° 2041-MEC-SD). Il ne figure pas sur la présente facture et n'est pas compris dans son montant.`
    );
  }
  for (const m of mentions) {
    for (const t of lignes(m, normal, 10, L)) {
      ecrire(t, G, y, { size: 10 });
      y -= 14;
    }
    y -= 4;
  }

  // Signature du président + (si le fichier existe) image de signature.
  y -= 24;
  const bloc = G + L - 200;
  ecrire("Le Président", bloc, y, { font: gras, size: 10 });
  ecrire(SOU.president, bloc, y - 14, { size: 10 });
  const signature = await imageDistante("/documents/signature-president.png");
  if (signature) {
    const img = await doc.embedPng(signature);
    const h = 50;
    const w = Math.min(160, (img.width / img.height) * h);
    page.drawImage(img, { x: bloc, y: y - 14 - 8 - h, width: w, height: h });
  }

  if (f.statut === "annulee") {
    page.drawText("ANNULÉE", {
      x: 120,
      y: 380,
      font: gras,
      size: 90,
      color: rgb(0.86, 0.15, 0.15),
      opacity: 0.25,
      rotate: { type: "degrees", angle: 30 },
    });
  }

  // Pied de page.
  const pied = `${SOU.nom} — association loi 1901 — SIRET ${SOU.siret} — RNA ${SOU.rna}`;
  const larg = normal.widthOfTextAtSize(sur(pied), 8);
  ecrire(pied, (595.28 - larg) / 2, 30, { size: 8, color: GRIS });

  return doc.save();
}
