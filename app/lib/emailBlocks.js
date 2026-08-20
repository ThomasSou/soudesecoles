// Rendu des e-mails composés par blocs dans le back-office. Reste un module
// JS pur (pas de dépendance React/serveur) pour être utilisable à la fois
// dans l'éditeur (aperçu client) et dans la route d'envoi (génération du
// HTML final).

export const BLUE = "#1F3864";
export const GOLD = "#B08D57";

export const BLOCK_TYPES = [
  { type: "heading", label: "Titre" },
  { type: "paragraph", label: "Paragraphe" },
  { type: "image", label: "Image" },
  { type: "button", label: "Bouton" },
  { type: "divider", label: "Séparateur" },
  { type: "spacer", label: "Espacement" },
];

export function newBlock(type) {
  const id = `b${Date.now()}${Math.round(Math.random() * 10000)}`;
  switch (type) {
    case "heading":
      return { id, type, text: "Votre titre" };
    case "paragraph":
      return { id, type, text: "Votre texte ici. Vous pouvez faire plusieurs lignes." };
    case "image":
      return { id, type, url: "", alt: "", link: "" };
    case "button":
      return { id, type, text: "En savoir plus", url: "https://soumontmerle.netlify.app", color: "blue" };
    case "divider":
      return { id, type };
    case "spacer":
      return { id, type, size: "md" };
    default:
      return { id, type: "paragraph", text: "" };
  }
}

export const TEMPLATES = [
  {
    key: "vierge",
    label: "Vierge",
    blocks: () => [newBlock("heading"), newBlock("paragraph")],
  },
  {
    key: "evenement",
    label: "Annonce d'événement",
    blocks: () => [
      { ...newBlock("heading"), text: "Un événement approche !" },
      {
        ...newBlock("paragraph"),
        text: "Nous avons le plaisir de vous annoncer notre prochaine manifestation. Retrouvez toutes les informations (date, lieu, programme) sur le site.",
      },
      { ...newBlock("button"), text: "Voir l'événement", url: "https://soumontmerle.netlify.app/evenements" },
    ],
  },
  {
    key: "cotisation",
    label: "Relance cotisation",
    blocks: () => [
      { ...newBlock("heading"), text: "Votre cotisation vous attend" },
      {
        ...newBlock("paragraph"),
        text: "Nous n'avons pas encore reçu votre cotisation pour cette année scolaire. Elle nous permet de financer les projets pédagogiques de l'école. Merci de la régulariser dès que possible.",
      },
      { ...newBlock("button"), text: "Accéder à mon espace", url: "https://soumontmerle.netlify.app/espace-adherent" },
    ],
  },
];

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function textToHtmlParagraphs(text) {
  return escapeHtml(text)
    .split(/\n+/)
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">${line}</p>`)
    .join("");
}

const SPACER_HEIGHTS = { sm: 12, md: 24, lg: 48 };
const BUTTON_COLORS = { blue: BLUE, gold: GOLD };

function blockToHtml(block) {
  switch (block.type) {
    case "heading":
      return `<h2 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:${BLUE};font-family:Georgia,'Times New Roman',serif;">${escapeHtml(block.text)}</h2>`;
    case "paragraph":
      return textToHtmlParagraphs(block.text);
    case "image":
      if (!block.url) return "";
      // eslint-disable-next-line no-case-declarations
      const img = `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}" style="max-width:100%;display:block;margin:0 0 14px;border-radius:8px;" />`;
      return block.link ? `<a href="${escapeHtml(block.link)}" style="text-decoration:none;">${img}</a>` : img;
    case "button": {
      const bg = BUTTON_COLORS[block.color] || BLUE;
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="border-radius:999px;background:${bg};"><a href="${escapeHtml(block.url)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(block.text)}</a></td></tr></table>`;
    }
    case "divider":
      return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />`;
    case "spacer":
      return `<div style="height:${SPACER_HEIGHTS[block.size] || 24}px;line-height:1px;font-size:1px;">&nbsp;</div>`;
    default:
      return "";
  }
}

// HTML complet, prêt à envoyer (table-based, styles en ligne pour la
// compatibilité avec les clients mail).
export function renderBlocksToHtml(blocks, { subject } = {}) {
  const body = (blocks || []).map(blockToHtml).join("\n");
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject || "")}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:${BLUE};padding:20px 32px;">
                <span style="color:#ffffff;font-size:16px;font-weight:bold;font-family:Georgia,'Times New Roman',serif;">Sou des Écoles Montmerle-Lurcy</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
                  Vous recevez cet e-mail en tant qu'adhérent ou contact du Sou des Écoles Laïques Montmerle-Lurcy.
                  Pour toute question, répondez directement à cet e-mail.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Version texte simple (fallback pour les clients mail sans HTML).
export function renderBlocksToText(blocks) {
  return (blocks || [])
    .map((b) => {
      if (b.type === "heading") return `${b.text}\n${"=".repeat((b.text || "").length)}`;
      if (b.type === "paragraph") return b.text;
      if (b.type === "button") return `${b.text} : ${b.url}`;
      if (b.type === "image") return b.url ? `[Image : ${b.url}]` : "";
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}
