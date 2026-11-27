// Tickets nominatifs remis aux acheteurs de la boutique (Marché de Noël…) :
// 12 par page A4, un ticket par unité (3 tartiflettes = 3 tickets, « 3 tours
// de biathlon » = 3 tickets). Le visuel dépend du produit, reconnu à son nom.
//
// Sapins : le bandeau de taille porte une COULEUR, la même que l'étiquette
// posée sur les sapins le jour J. Ne pas changer ces couleurs sans changer
// les étiquettes (repris des tickets préparés à la main en 2026).
export const COULEURS_SAPIN = [
  { min: 80, couleur: "#FFF0AD" }, // 80–100 cm : jaune
  { min: 100, couleur: "#E3CCF5" }, // 100–150 cm : violet clair
  { min: 150, couleur: "#DEDEDE" }, // 150–200 cm : gris
  { min: 200, couleur: "#FCD1E3" }, // 200–250 cm : rose
];

const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function couleurSapin(tailleMin) {
  return COULEURS_SAPIN.find((c) => c.min === tailleMin)?.couleur || null;
}

// Petit motif pour les produits sans visuel dédié.
function motif(n) {
  if (/passeport|jeu/.test(n)) return "🎟️";
  if (/pain d.?epice/.test(n)) return "🍪";
  if (/photo|pere noel/.test(n)) return "📸";
  if (/panettone/.test(n)) return "🍞";
  if (/boule/.test(n)) return "🎄";
  if (/tombola/.test(n)) return "🍀";
  if (/crepe|gaufre/.test(n)) return "🥞";
  if (/vin|chocolat|boisson/.test(n)) return "☕";
  return "⭐";
}

// Décrit le ticket d'un article commandé : { nombre, type, ... }.
export function modeleTicket(item) {
  const n = sansAccent(item.name);
  const qty = Number(item.qty) || 0;
  const options = Array.isArray(item.options) && item.options.length
    ? item.options.map((o) => `${o.label} : ${o.value}`).join(" · ")
    : "";

  if (/sapin|nordmann|epicea/.test(n)) {
    const m = n.match(/(\d{2,3})\s*(?:\/|-|–|a)\s*(\d{2,3})/);
    const min = m ? Number(m[1]) : null;
    return {
      nombre: qty,
      type: "sapin",
      taille: m ? `${m[1]}–${m[2]} cm` : item.name,
      couleur: min ? couleurSapin(min) : null,
      // tous les sapins ensemble, du plus petit au plus grand
      groupe: `sapin ${String(min || 999).padStart(3, "0")}`,
    };
  }
  if (/tartiflette/.test(n)) {
    return { nombre: qty, type: "image", image: "tartiflette.jpg", couleur: "#b45309",
      lignes: ["BON POUR", "UNE PART", "DE TARTIFLETTE"], extra: /boisson/.test(n) ? "+ 1 BOISSON + 1 CAFÉ" : "" };
  }
  if (/poutine/.test(n)) {
    return { nombre: qty, type: "image", image: "poutine.jpg", couleur: "#b45309", lignes: [], extra: "" }; // l'image porte déjà « Bon pour une poutine »
  }
  if (/biathlon/.test(n)) {
    const tours = Number((n.match(/(\d+)\s*tours?/) || [])[1]) || 1;
    const age = /8\s*(a|-)\s*12/.test(n) ? "8/12 ANS" : /12\s*ans\s*et|plus de 12|\+\s*de\s*12|adulte/.test(n) ? "+ DE 12 ANS" : "";
    return { nombre: qty * tours, type: "image", image: "biathlon.jpg", couleur: "#7c2d12",
      lignes: ["BON POUR LE", "BIATHLON LASER"], extra: [age, "1 tour"].filter(Boolean).join(" · ") };
  }
  if (/lampion/.test(n)) {
    return { nombre: qty, type: "image", image: "lampion.jpg", couleur: "#1d6fa5", lignes: ["BON POUR", "1 LAMPION"], extra: "" };
  }
  return { nombre: qty, type: "motif", motif: motif(n), couleur: "#1F3864", lignes: ["BON POUR"], produit: item.name, extra: options };
}

const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function ticketHtml(t, origine) {
  const nom = `<div class="nom">${esc(t.acheteur)}</div>`;
  if (t.type === "sapin") {
    const fond = t.couleur ? `background:${t.couleur};` : "";
    return `<div class="t"><div class="taille" style="${fond}">${esc(t.taille)}</div><img class="sapin" src="${origine}/tickets/sapin.png" alt="">${nom}</div>`;
  }
  const titre = (t.lignes || []).map((l) => `<div>${esc(l)}</div>`).join("");
  const produit = t.produit ? `<div class="produit">${esc(t.produit)}</div>` : "";
  const extra = t.extra ? `<div class="extra">${esc(t.extra)}</div>` : "";
  const visuel = t.type === "image" ? `<img class="photo" src="${origine}/tickets/${t.image}" alt="">` : `<div class="motif">${t.motif}</div>`;
  return `<div class="t"><div class="titre" style="color:${t.couleur}">${titre}${produit}</div>${extra}${visuel}${nom}</div>`;
}

// commandes : commandes PAYÉES ; produitsChoisis : noms de produits retenus ;
// ordre : "produit" (un paquet par produit, comme les tickets faits main) ou "acheteur".
export function genererTickets(commandes, produitsChoisis, ordre = "produit") {
  const tickets = [];
  for (const c of commandes) {
    const acheteur = `${c.buyer_first_name || ""} ${c.buyer_last_name || ""}`.trim();
    for (const it of c.items || []) {
      if (!produitsChoisis.includes(it.name)) continue;
      const m = modeleTicket(it);
      for (let k = 0; k < m.nombre; k++) tickets.push({ ...m, acheteur, nomProduit: it.name, nomTri: `${c.buyer_last_name || ""} ${c.buyer_first_name || ""}` });
    }
  }
  tickets.sort((a, b) =>
    ordre === "acheteur"
      ? a.nomTri.localeCompare(b.nomTri, "fr") || a.nomProduit.localeCompare(b.nomProduit, "fr")
      : (a.groupe || a.nomProduit).localeCompare(b.groupe || b.nomProduit, "fr") || a.nomTri.localeCompare(b.nomTri, "fr")
  );
  return tickets;
}

export function pageTicketsHtml(tickets, origine, titre) {
  const pages = [];
  for (let i = 0; i < tickets.length; i += 12) {
    pages.push(`<div class="page">${tickets.slice(i, i + 12).map((t) => ticketHtml(t, origine)).join("")}</div>`);
  }
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title> </title><style>
@page{size:210mm 297mm;margin:0}
html,body{margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;color:#1e293b}
.page{display:grid;grid-template-columns:repeat(3,70mm);grid-template-rows:repeat(4,74.25mm);width:210mm;height:297mm;overflow:hidden;page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
.t{box-sizing:border-box;border-right:1px dashed #94a3b8;border-bottom:1px dashed #94a3b8;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:6mm 4mm 5mm;text-align:center;overflow:hidden}
.t:nth-child(3n){border-right:none}
.t:nth-child(n+10){border-bottom:none}
.titre{font-weight:bold;font-size:14px;line-height:1.25;letter-spacing:.3px}
.produit{font-size:14px;margin-top:2px;text-transform:none}
.extra{font-size:10px;font-weight:bold;color:#b45309;margin-top:1px}
.photo{max-width:92%;max-height:38mm;object-fit:contain;border-radius:4px}
.motif{font-size:56px;line-height:1}
.nom{font-weight:bold;font-size:15px}
.taille{font-weight:bold;font-size:22px;padding:1mm 4mm;border-radius:2px}
.sapin{max-height:46mm;max-width:80%;object-fit:contain}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style></head><body>${pages.join("")}<script>window.onload=function(){window.print()}</script></body></html>`;
}
