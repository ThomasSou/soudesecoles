// Rendu des e-mails composés par blocs dans le back-office. Reste un module
// JS pur (pas de dépendance React) pour être utilisable à la fois dans
// l'éditeur (aperçu client) et dans la route d'envoi (génération du HTML
// final, personnalisé par destinataire).

import { PARTNERS, TIER_ORDER } from "../partenaires/data";
import { currentSchoolYear } from "./anneeScolaire";

export const BLUE = "#1F3864";
export const GOLD = "#B08D57";
export const SITE_URL = "https://sou-montmerle.fr";

export const BLOCK_TYPES = [
  { type: "heading", label: "Titre" },
  { type: "paragraph", label: "Paragraphe" },
  { type: "colonnes", label: "2 colonnes" },
  { type: "image", label: "Image" },
  { type: "button", label: "Bouton" },
  { type: "divider", label: "Séparateur" },
  { type: "spacer", label: "Espacement" },
];

// Champs personnalisables insérables dans un titre ou un paragraphe.
export const CHAMPS_FUSION = [
  { token: "{{prenom}}", label: "Prénom" },
  { token: "{{nom}}", label: "Nom" },
];

// Couleurs de texte proposées dans l'éditeur (appliquées à tout le bloc).
export const COULEURS_TEXTE = [
  { key: "defaut", label: "Défaut", value: null },
  { key: "bleu", label: "Bleu", value: BLUE },
  { key: "dore", label: "Doré", value: GOLD },
  { key: "rouge", label: "Rouge", value: "#DC2626" },
  { key: "vert", label: "Vert", value: "#15803D" },
];

export const TAILLES_TEXTE = {
  paragraph: [
    { key: "sm", label: "Petit", px: 13 },
    { key: "md", label: "Normal", px: 15 },
    { key: "lg", label: "Grand", px: 18 },
  ],
  heading: [
    { key: "sm", label: "Petit", px: 18 },
    { key: "md", label: "Normal", px: 22 },
    { key: "lg", label: "Grand", px: 28 },
  ],
};

// Emojis courants proposés dans l'éditeur (insertion au curseur, comme les
// champs de fusion).
export const EMOJIS = [
  "😀", "😊", "🎉", "🎈", "🎊", "👍", "❤️", "⭐", "✅", "📅",
  "📍", "⏰", "🍽️", "🎵", "🎨", "⚽", "🎓", "📣", "🙏", "🌟",
];

export function newBlock(type) {
  const id = `b${Date.now()}${Math.round(Math.random() * 10000)}`;
  switch (type) {
    case "heading":
      return { id, type, text: "Bonjour {{prenom}},", size: "md", color: null };
    case "paragraph":
      return { id, type, text: "Votre texte ici. Vous pouvez faire plusieurs lignes.", size: "md", color: null };
    case "colonnes":
      return {
        id,
        type,
        gauche: { kind: "texte", text: "Texte de gauche", url: "", alt: "", link: "" },
        droite: { kind: "texte", text: "Texte de droite", url: "", alt: "", link: "" },
      };
    case "image":
      return { id, type, url: "", alt: "", link: "" };
    case "button":
      return { id, type, text: "En savoir plus", url: SITE_URL, color: "blue" };
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
      { ...newBlock("heading"), text: "Bonjour {{prenom}}, un événement approche !" },
      {
        ...newBlock("paragraph"),
        text: "Nous avons le plaisir de vous annoncer notre prochaine manifestation. Retrouvez toutes les informations (date, lieu, programme) sur le site.",
      },
      { ...newBlock("button"), text: "Voir l'événement", url: `${SITE_URL}/evenements` },
    ],
  },
  {
    key: "cotisation",
    label: "Relance cotisation",
    blocks: () => [
      { ...newBlock("heading"), text: "Bonjour {{prenom}}," },
      {
        ...newBlock("paragraph"),
        text: "Nous n'avons pas encore reçu votre cotisation pour cette année scolaire. Elle nous permet de financer les projets pédagogiques de l'école. Merci de la régulariser dès que possible.",
      },
      { ...newBlock("button"), text: "Accéder à mon espace", url: `${SITE_URL}/espace-adherent` },
    ],
  },
];

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Remplace les champs de fusion ({{prenom}}, {{nom}}) par les données du
// destinataire. Se fait avant l'échappement HTML, sur le texte brut.
//
// Quand le prénom (ou le nom) est vide — fréquent pour les destinataires
// d'une « liste d'adresses » qui ne correspondent à aucune fiche — on retire
// aussi l'espace qui précède le champ : « Bonjour {{prenom}}, » donne alors
// « Bonjour, » et non « Bonjour , ».
function fusion(text, recipient) {
  const prenom = (recipient.firstName || "").trim();
  const nom = (recipient.lastName || "").trim();
  return String(text || "")
    .replace(/ ?\{\{\s*prenom\s*\}\}/gi, prenom ? ` ${prenom}` : "")
    .replace(/ ?\{\{\s*nom\s*\}\}/gi, nom ? ` ${nom}` : "");
}

// Petite mise en forme "à la markdown" appliquée APRÈS échappement HTML
// (les caractères *, [, ], ( ne sont pas touchés par escapeHtml, donc la
// syntaxe survit à l'échappement) : **gras** et [texte](lien).
function appliquerMiseEnForme(html) {
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (m, texte, url) => `<a href="${url}" style="color:${BLUE};text-decoration:underline;">${texte}</a>`
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}

// Retire la syntaxe de mise en forme pour la version texte brut.
function retirerMiseEnForme(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}

function textToHtmlParagraphs(text, recipient, { size = "md", color } = {}) {
  const px = (TAILLES_TEXTE.paragraph.find((t) => t.key === size) || TAILLES_TEXTE.paragraph[1]).px;
  const couleur = color || "#334155";
  return fusion(text, recipient)
    .split(/\n+/)
    .filter((line) => line.trim().length > 0)
    .map(
      (line) =>
        `<p style="margin:0 0 14px;font-size:${px}px;line-height:1.6;color:${couleur};">${appliquerMiseEnForme(
          escapeHtml(line)
        )}</p>`
    )
    .join("");
}

const SPACER_HEIGHTS = { sm: 12, md: 24, lg: 48 };
const BUTTON_COLORS = { blue: BLUE, gold: GOLD };

function colonneCelluleHtml(col) {
  if (!col) return "";
  let inner;
  if (col.kind === "image") {
    if (!col.url) return "";
    inner = `<img src="${escapeHtml(col.url)}" alt="${escapeHtml(col.alt || "")}" style="max-width:100%;display:block;border-radius:8px;" />`;
  } else {
    inner = `<p style="margin:0;font-size:14px;line-height:1.5;color:#334155;">${appliquerMiseEnForme(
      escapeHtml(col.text || "")
    )}</p>`;
  }
  return col.link ? `<a href="${escapeHtml(col.link)}" style="text-decoration:none;color:inherit;display:block;">${inner}</a>` : inner;
}

function blockToHtml(block, recipient) {
  switch (block.type) {
    case "heading": {
      const px = (TAILLES_TEXTE.heading.find((t) => t.key === block.size) || TAILLES_TEXTE.heading[1]).px;
      const couleur = block.color || BLUE;
      return `<h2 style="margin:0 0 14px;font-size:${px}px;line-height:1.3;color:${couleur};font-family:Georgia,'Times New Roman',serif;">${appliquerMiseEnForme(
        escapeHtml(fusion(block.text, recipient))
      )}</h2>`;
    }
    case "paragraph":
      return textToHtmlParagraphs(block.text, recipient, { size: block.size, color: block.color });
    case "colonnes":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;"><tr>
        <td width="48%" valign="top" style="width:48%;">${colonneCelluleHtml(block.gauche)}</td>
        <td width="4%">&nbsp;</td>
        <td width="48%" valign="top" style="width:48%;">${colonneCelluleHtml(block.droite)}</td>
      </tr></table>`;
    case "image":
      if (!block.url) return "";
      // eslint-disable-next-line no-case-declarations
      const img = `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}" style="max-width:100%;display:block;margin:0 0 14px;border-radius:8px;" />`;
      return block.link ? `<a href="${escapeHtml(block.link)}" style="text-decoration:none;">${img}</a>` : img;
    case "button": {
      const bg = BUTTON_COLORS[block.color] || BLUE;
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="border-radius:999px;background:${bg};"><a href="${escapeHtml(block.url)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(fusion(block.text, recipient))}</a></td></tr></table>`;
    }
    case "divider":
      return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />`;
    case "spacer":
      return `<div style="height:${SPACER_HEIGHTS[block.size] || 24}px;line-height:1px;font-size:1px;">&nbsp;</div>`;
    default:
      return "";
  }
}

// Valeurs par défaut appliquées au rendu d'un e-mail. Volontairement SANS
// prénom : pour un envoi réel où le destinataire n'a pas de prénom connu,
// « {{prenom}} » doit donner « Bonjour, » et jamais un nom d'exemple.
export const DEFAULT_RECIPIENT = {
  firstName: "",
  lastName: "",
  adherent: true,
  parentId: null,
};

// Destinataire fictif pour l'APERÇU de l'éditeur uniquement (jamais un envoi
// réel) : un prénom d'exemple rend l'aperçu plus parlant.
export const APERCU_RECIPIENT = {
  firstName: "Camille",
  lastName: "Gour",
  adherent: true,
  parentId: null,
};

// Bandeau de statut d'adhésion, ajouté automatiquement en bas de chaque
// e-mail envoyé à une famille (pas un bloc éditable : toujours présent).
function adhesionBadgeHtml(recipient) {
  if (recipient.adherent) {
    const anneeFin = Number(currentSchoolYear().split("-")[1]);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;">
      <p style="margin:0;font-size:14px;color:#15803d;font-weight:600;">✓ Adhésion en cours — valable jusqu'au 31 août ${anneeFin}</p>
    </td></tr></table>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;">
    <p style="margin:0 0 10px;font-size:14px;color:#b91c1c;font-weight:600;">✕ Non adhérent pour cette année scolaire</p>
    <a href="${SITE_URL}/espace-adherent" style="display:inline-block;padding:9px 18px;font-size:13px;font-weight:600;color:#ffffff;background:${BLUE};text-decoration:none;border-radius:999px;">Adhérer dès maintenant</a>
  </td></tr></table>`;
}

// Ratio largeur/hauteur de chaque logo, mesuré sur le fichier source d'origine.
// Sert à calculer un width/height HTML explicite sur chaque <img> du pied
// d'e-mail : sans ces attributs, Gmail (mobile) et Outlook ignorent le CSS et
// affichent l'image à sa taille native — barrels.png fait 25000 px de large,
// d'où les logos géants signalés lors des envois de test.
// À mettre à jour si un fichier de logo est remplacé (voir app/partenaires/data.js).
const LOGO_RATIO = {
  "barrels.png": 25115 / 7314,
  "diennet.jpg": 364 / 351,
  "nicod.jpg": 526 / 333,
  "spar.jpg": 367 / 366,
  "millesime.jpg": 353 / 226,
  "emilejob.jpg": 196 / 241,
  "maitresdeboucheurs.jpg": 1146 / 1035,
};

// Hauteur d'affichage par palier : l'Or plus grand que l'Argent, lui-même plus
// grand que le Bronze (demande de Thomas). Largeur plafonnée pour les logos
// très panoramiques (le bandeau-mot « Barrels »).
const LOGO_HAUTEUR_PAR_PALIER = { Gold: 48, Silver: 36, Bronze: 28 };
const LOGO_LARGEUR_MAX = 150;

// Logos des partenaires, cliquables vers leur site, ajoutés automatiquement
// en pied de chaque e-mail. Présentés dans l'ordre des paliers (Or, Argent,
// Bronze) et servis en versions réduites dédiées à l'e-mail
// (public/partenaires/email/), pas les gros originaux du site.
function partenairesHtml() {
  const paliers = [...PARTNERS].sort(
    (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
  );
  const logos = paliers
    .map((p) => {
      const ratio = LOGO_RATIO[p.file] || 1;
      let h = LOGO_HAUTEUR_PAR_PALIER[p.tier] || 32;
      let w = Math.round(h * ratio);
      if (w > LOGO_LARGEUR_MAX) {
        w = LOGO_LARGEUR_MAX;
        h = Math.round(w / ratio);
      }
      const href = escapeHtml(p.website || SITE_URL + "/partenaires");
      return `<a href="${href}" style="display:inline-block;margin:8px 10px;text-decoration:none;vertical-align:middle;"><img src="${SITE_URL}/partenaires/email/${p.file}" alt="${escapeHtml(p.name)}" width="${w}" height="${h}" style="width:${w}px;height:${h}px;max-width:${w}px;border:0;" /></a>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px;"><tr><td style="text-align:center;padding:16px 12px;">
    <p style="margin:0 0 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Merci à nos partenaires</p>
    ${logos}
  </td></tr></table>`;
}

// URL de désinscription pour un destinataire donné : lien direct si on
// connaît son identifiant — parent (`p`) ou contact hors famille (`c`,
// cf. table email_contacts). Sans identifiant (aperçu générique), on pointe
// vers la page de contact plutôt que de risquer une désinscription à
// l'aveugle.
function lienDesabonnement(recipient, campaignId) {
  // `camp` (id de campagne) sert seulement à incrémenter un compteur de
  // désinscriptions par campagne — jamais à identifier la personne.
  const camp = campaignId ? `&camp=${campaignId}` : "";
  if (recipient?.parentId) return `${SITE_URL}/api/emails/desabonner?p=${recipient.parentId}${camp}`;
  if (recipient?.contactId) return `${SITE_URL}/api/emails/desabonner?c=${recipient.contactId}${camp}`;
  return `${SITE_URL}/contact`;
}

// En-têtes de désinscription (RFC 2369 + RFC 8058, « un clic »). Gmail et
// Apple Mail affichent alors leur propre bouton « Se désinscrire » en haut du
// message, et leur présence est un critère de délivrabilité pour les envois
// en nombre. Nécessite un identifiant de destinataire (parent ou contact) :
// sans lui (aperçu générique), on ne renvoie aucun en-tête plutôt que de
// risquer une désinscription à l'aveugle.
export function entetesDesinscription(recipient, { contactEmail, campaignId } = {}) {
  if (!recipient || (!recipient.parentId && !recipient.contactId)) return {};
  const cibles = [`<${lienDesabonnement(recipient, campaignId)}>`];
  if (contactEmail) cibles.push(`<mailto:${contactEmail}?subject=desinscription>`);
  return {
    "List-Unsubscribe": cibles.join(", "),
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

// Lien de désinscription (obligatoire pour un envoi de masse).
function desabonnementHtml(recipient, campaignId) {
  return `<a href="${lienDesabonnement(recipient, campaignId)}" style="color:#94a3b8;text-decoration:underline;">Se désinscrire de ces e-mails</a>`;
}

// HTML complet, prêt à envoyer (table-based, styles en ligne pour la
// compatibilité avec les clients mail), personnalisé pour un destinataire
// donné (champs de fusion + statut d'adhésion).
// Pixel de mesure d'ouverture. Keyé sur l'id de campagne quand il est connu
// (compteur opens_count par campagne), sinon sur l'objet (compteur global de
// /admin/statistiques). Dans les deux cas : JAMAIS d'identifiant du lecteur.
// Rappel : beaucoup de messageries bloquent les images, le compteur est donc
// un minimum et non un chiffre exact.
function mesureOuvertureHtml({ subject, campaignId } = {}) {
  const param = campaignId
    ? `c=${encodeURIComponent(campaignId)}`
    : `e=${encodeURIComponent((subject || "Sans objet").slice(0, 120))}`;
  return `<img src="${SITE_URL}/api/emails/pixel?${param}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" />`;
}

// Formate une plage horaire de créneau : "sam. 4 sept., 09:00 – 12:00".
// Le fuseau est fixé explicitement : ce rendu se fait côté serveur (Netlify
// tourne en UTC) alors que les créneaux sont des timestamptz. Sans ça, un
// créneau saisi à 14h00 (heure de Montmerle) ressortirait "12:00" dans
// l'e-mail l'été, et décalerait de jour pour un créneau proche de minuit —
// en plus d'être incohérent avec la page /benevoles, formatée, elle, dans le
// fuseau du navigateur du lecteur.
const FUSEAU_CRENEAUX = "Europe/Paris";
function formaterPlageCreneau(debut, fin) {
  try {
    const d = new Date(debut);
    const f = new Date(fin);
    if (Number.isNaN(d.getTime())) return "";
    const jour = d.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: FUSEAU_CRENEAUX,
    });
    const h = (x) =>
      x.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: FUSEAU_CRENEAUX,
      });
    return Number.isNaN(f.getTime())
      ? `${jour}, ${h(d)}`
      : `${jour}, ${h(d)} – ${h(f)}`;
  } catch {
    return "";
  }
}

function dispoCreneauTexte(c) {
  if (c.placesRestantes <= 0) return "complet";
  return `il reste ${c.placesRestantes} place${
    c.placesRestantes > 1 ? "s" : ""
  } sur ${c.places}`;
}

// Récapitulatif des créneaux bénévoles d'un événement, inséré (en option)
// dans une campagne. Les places restantes sont celles de l'instant de
// l'envoi : le lien renvoie vers la page publique, toujours à jour.
// `planning` : { nom, ateliers: [{ nom, creneaux: [{ nom, debut, fin, places, placesRestantes }] }] }
export function planningCreneauxHtml(planning) {
  if (!planning || !Array.isArray(planning.ateliers) || planning.ateliers.length === 0) {
    return "";
  }
  const lien = `${SITE_URL}/benevoles`;
  // Toute cellule du tableau est cliquable : le contenu est enveloppé dans un
  // lien pleine largeur vers la page publique des créneaux (toujours à jour).
  const cell = (inner, style, colspan = 1) =>
    `<td${colspan > 1 ? ` colspan="${colspan}"` : ""} style="${style}"><a href="${lien}" style="display:block;color:inherit;text-decoration:none;">${inner}</a></td>`;

  const corps = planning.ateliers
    .map((a) => {
      const creneaux = (a.creneaux || [])
        .map((c) => {
          const complet = c.placesRestantes <= 0;
          const dispo = complet
            ? `<span style="color:#b91c1c;font-weight:600;">complet</span>`
            : `<span style="color:#15803d;font-weight:600;">il reste ${c.placesRestantes} place${
                c.placesRestantes > 1 ? "s" : ""
              } sur ${c.places}</span>`;
          const libelle = [c.nom, formaterPlageCreneau(c.debut, c.fin)]
            .filter(Boolean)
            .join(" — ");
          return `<tr>
            ${cell(
              escapeHtml(libelle),
              "padding:6px 10px;font-size:13px;color:#334155;border-top:1px solid #e2e8f0;"
            )}
            ${cell(
              dispo,
              "padding:6px 10px;font-size:13px;text-align:right;border-top:1px solid #e2e8f0;white-space:nowrap;"
            )}
          </tr>`;
        })
        .join("");
      return `<tr>${cell(
        escapeHtml(a.nom || ""),
        `padding:12px 10px 2px;font-size:14px;font-weight:700;color:${BLUE};`,
        2
      )}</tr>${creneaux}`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border:1px solid #e2e8f0;border-radius:10px;">
    <tr>${cell(
      `Créneaux bénévoles${planning.nom ? ` — ${escapeHtml(planning.nom)}` : ""}`,
      `padding:14px 10px 2px;font-size:15px;font-weight:700;color:${BLUE};font-family:Georgia,'Times New Roman',serif;`,
      2
    )}</tr>
    <tr>${cell(
      "Places disponibles au moment de l'envoi de cet e-mail. Cliquez pour vous inscrire sur la page à jour.",
      "padding:0 10px 6px;font-size:12px;color:#64748b;line-height:1.5;",
      2
    )}</tr>
    ${corps}
    <tr><td colspan="2" style="padding:14px 10px 12px;">
      <a href="${lien}" style="display:inline-block;padding:10px 22px;font-size:13px;font-weight:600;color:#ffffff;background:${BLUE};text-decoration:none;border-radius:999px;">Voir les créneaux et m'inscrire</a>
    </td></tr>
  </table>`;
}

export function planningCreneauxTexte(planning) {
  if (!planning || !Array.isArray(planning.ateliers) || planning.ateliers.length === 0) {
    return "";
  }
  const corps = planning.ateliers
    .map((a) => {
      const cs = (a.creneaux || [])
        .map(
          (c) =>
            `  - ${[c.nom, formaterPlageCreneau(c.debut, c.fin)]
              .filter(Boolean)
              .join(" — ")} : ${dispoCreneauTexte(c)}`
        )
        .join("\n");
      return `${a.nom || ""}\n${cs}`;
    })
    .join("\n\n");
  return `Créneaux bénévoles${planning.nom ? ` — ${planning.nom}` : ""}\n(Places disponibles au moment de l'envoi. Inscription à jour : ${SITE_URL}/benevoles)\n\n${corps}\n\nS'inscrire : ${SITE_URL}/benevoles`;
}

export function renderBlocksToHtml(blocks, { subject, recipient, planning, campaignId } = {}) {
  const dest = { ...DEFAULT_RECIPIENT, ...(recipient || {}) };
  const body = (blocks || []).map((b) => blockToHtml(b, dest)).join("\n");
  const planningHtml = planningCreneauxHtml(planning);

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
              <td style="background:${BLUE};padding:18px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                  <td style="padding-right:12px;"><img src="${SITE_URL}/logo/logo-email.png" alt="Logo" width="36" height="36" style="display:block;" /></td>
                  <td><span style="color:#ffffff;font-size:16px;font-weight:bold;font-family:Georgia,'Times New Roman',serif;">Sou des Écoles Montmerle-Lurcy</span></td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px;">
                ${adhesionBadgeHtml(dest)}
                ${body}
                ${planningHtml}
              </td>
            </tr>
            <tr>
              <td>${partenairesHtml()}</td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;line-height:1.5;">
                  Vous recevez cet e-mail en tant qu'adhérent ou contact du Sou des Écoles Laïques Montmerle-Lurcy.
                  Pour toute question, répondez directement à cet e-mail.
                </p>
                <p style="margin:0;font-size:12px;">${desabonnementHtml(dest, campaignId)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${mesureOuvertureHtml({ subject, campaignId })}
  </body>
</html>`;
}

// Version texte simple (fallback pour les clients mail sans HTML).
export function renderBlocksToText(blocks, { recipient, planning, campaignId } = {}) {
  const dest = { ...DEFAULT_RECIPIENT, ...(recipient || {}) };
  const statut = dest.adherent
    ? "Adhésion en cours."
    : `Non adhérent pour cette année scolaire. Adhérer : ${SITE_URL}/espace-adherent`;

  const corps = (blocks || [])
    .map((b) => {
      if (b.type === "heading") return `${retirerMiseEnForme(fusion(b.text, dest))}\n${"=".repeat((b.text || "").length)}`;
      if (b.type === "paragraph") return retirerMiseEnForme(fusion(b.text, dest));
      if (b.type === "colonnes") {
        const g = b.gauche?.kind === "texte" ? retirerMiseEnForme(b.gauche.text || "") : "";
        const d = b.droite?.kind === "texte" ? retirerMiseEnForme(b.droite.text || "") : "";
        return [g, d].filter(Boolean).join("   |   ");
      }
      if (b.type === "button") return `${fusion(b.text, dest)} : ${b.url}`;
      if (b.type === "image") return b.url ? `[Image : ${b.url}]` : "";
      return "";
    })
    .filter(Boolean)
    .join("\n\n");

  const desabo = lienDesabonnement(dest, campaignId);

  const planningTxt = planningCreneauxTexte(planning);

  return `${statut}\n\n${corps}${
    planningTxt ? `\n\n${planningTxt}` : ""
  }\n\n--\nSe désinscrire : ${desabo}`;
}
