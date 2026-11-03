import { PARTNERS } from "../partenaires/data";

// Page publique d'un partenaire : contenu en modules, TEXTE BRUT uniquement
// (jamais de HTML), images uniquement hébergées dans le bucket public du
// partenaire. Tout ce qui vient du navigateur passe par `nettoyerContenu`.

export const BUCKET_PAGES = "partenaire-pages";
export const MAX_MODULES = 12;
export const MAX_GALERIE = 6;
export const TYPES_MODULES = ["texte", "photo", "galerie", "infos", "bouton"];

const coupe = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

function urlSupabasePublique() {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_PAGES}/`;
}

// Une image n'est acceptée que si elle est dans le dossier de CE partenaire.
function urlImageValide(url, partenaireId) {
  return typeof url === "string" && url.startsWith(`${urlSupabasePublique()}${partenaireId}/`);
}

// Lien externe : http(s) uniquement (refuse javascript:, data:, etc.).
function urlLienValide(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

export function nettoyerContenu(contenu, partenaireId) {
  const modules = Array.isArray(contenu?.modules) ? contenu.modules.slice(0, MAX_MODULES) : [];
  const propres = [];
  for (const m of modules) {
    if (!m || !TYPES_MODULES.includes(m.type)) continue;
    if (m.type === "texte") {
      propres.push({ type: "texte", titre: coupe(m.titre, 120), texte: coupe(m.texte, 3000) });
    } else if (m.type === "photo") {
      if (!urlImageValide(m.url, partenaireId)) continue;
      propres.push({ type: "photo", url: m.url, legende: coupe(m.legende, 200) });
    } else if (m.type === "galerie") {
      const images = (Array.isArray(m.images) ? m.images : [])
        .filter((i) => urlImageValide(i?.url, partenaireId))
        .slice(0, MAX_GALERIE)
        .map((i) => ({ url: i.url, legende: coupe(i.legende, 200) }));
      if (images.length) propres.push({ type: "galerie", images });
    } else if (m.type === "infos") {
      propres.push({
        type: "infos",
        adresse: coupe(m.adresse, 250),
        telephone: coupe(m.telephone, 40),
        email: coupe(m.email, 160),
        site: urlLienValide(coupe(m.site, 300)),
        horaires: coupe(m.horaires, 800),
      });
    } else if (m.type === "bouton") {
      const url = urlLienValide(coupe(m.url, 300));
      const libelle = coupe(m.libelle, 60);
      if (url && libelle) propres.push({ type: "bouton", libelle, url });
    }
  }
  return { modules: propres };
}

// Point de départ de l'éditeur : ce qui s'affiche déjà aujourd'hui (data.js).
export function contenuInitial(slug) {
  const p = PARTNERS.find((x) => x.slug === slug);
  const modules = [];
  if (p?.description) modules.push({ type: "texte", titre: "", texte: p.description });
  if (p && (p.address || p.phone || p.email || p.website)) {
    modules.push({
      type: "infos",
      adresse: p.address || "",
      telephone: p.phone || "",
      email: p.email || "",
      site: p.website || "",
      horaires: "",
    });
  }
  return { modules };
}

export function partenaireStatique(slug) {
  return PARTNERS.find((x) => x.slug === slug) || null;
}
