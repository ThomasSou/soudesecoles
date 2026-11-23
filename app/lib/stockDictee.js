// Comprend une saisie dictée du stock ("douze packs de coca zéro, trois cartons
// de gobelets, 2 sacs poubelles périmés mars 2027") et la rapproche des
// articles déjà connus. Aucune dépendance : le site s'appuie sur l'existant
// (noms + alias déjà vus) car ~95 % des achats sont des produits récurrents.

export function sansAccents(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const UNITES_NOMBRE = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
};
const DIZAINES = { vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };

// Lit un nombre au début d'une liste de mots ; renvoie { valeur, mots } ou null.
export function lireNombre(mots) {
  const m = mots.map((x) => sansAccents(x).replace(/[^a-z0-9.,/-]/g, ""));
  if (!m.length) return null;
  if (/^\d+([.,]\d+)?$/.test(m[0])) return { valeur: parseFloat(m[0].replace(",", ".")), mots: 1 };
  if (m[0] === "demi" || m[0] === "demie") return { valeur: 0.5, mots: 1 };
  if (m[0] === "douzaine") return { valeur: 12, mots: 1 };
  let i = 0, total = 0, trouve = false;
  const prendre = (v, n = 1) => { total += v; i += n; trouve = true; };
  // centaines
  if (m[i] && UNITES_NOMBRE[m[i]] && m[i + 1] && /^cents?$/.test(m[i + 1])) { total += UNITES_NOMBRE[m[i]] * 100; i += 2; trouve = true; }
  else if (m[i] === "cent") { total += 100; i++; trouve = true; }
  const motsSplit = (x) => x.split("-");
  const lireDizaine = () => {
    let w = m[i]; if (!w) return false;
    const parts = motsSplit(w).filter((p) => p && p !== "et");
    // forme "soixante-dix-sept", "quatre-vingt-douze" collée
    const joint = parts.join(" ");
    const tab = [...parts];
    // on réassemble avec les mots suivants si besoin
    let consommes = 1;
    while (m[i + consommes] && (m[i + consommes] === "et" || UNITES_NOMBRE[m[i + consommes]] !== undefined || /^(dix|vingts?|onze|douze|treize|quatorze|quinze|seize)$/.test(m[i + consommes])) && consommes < 4) {
      tab.push(...motsSplit(m[i + consommes]).filter((p) => p && p !== "et"));
      consommes++;
    }
    void joint;
    const essayer = (toks) => {
      let v = 0, k = 0;
      if (toks[0] === "quatre" && /^vingts?$/.test(toks[1] || "")) {
        v = 80; k = 2;
        if (toks[k] !== undefined && UNITES_NOMBRE[toks[k]] !== undefined && UNITES_NOMBRE[toks[k]] > 0 && UNITES_NOMBRE[toks[k]] < 17) { v += UNITES_NOMBRE[toks[k]]; k++; }
        else if (toks[k] === "dix") { v += 10; k++; if (UNITES_NOMBRE[toks[k]] > 0 && UNITES_NOMBRE[toks[k]] < 10) { v += UNITES_NOMBRE[toks[k]]; k++; } }
        return { v, k };
      }
      if (DIZAINES[toks[0]]) {
        v = DIZAINES[toks[0]]; k = 1;
        if ((toks[0] === "soixante") && toks[k] === "dix") { v += 10; k++; if (UNITES_NOMBRE[toks[k]] > 0 && UNITES_NOMBRE[toks[k]] < 10) { v += UNITES_NOMBRE[toks[k]]; k++; } }
        else if (toks[0] === "soixante" && UNITES_NOMBRE[toks[k]] >= 11 && UNITES_NOMBRE[toks[k]] <= 16) { v += UNITES_NOMBRE[toks[k]]; k++; }
        else if (UNITES_NOMBRE[toks[k]] > 0 && UNITES_NOMBRE[toks[k]] < 10) { v += UNITES_NOMBRE[toks[k]]; k++; }
        return { v, k };
      }
      if (toks[0] === "dix") { v = 10; k = 1; if (UNITES_NOMBRE[toks[k]] > 6 && UNITES_NOMBRE[toks[k]] < 10) { v += UNITES_NOMBRE[toks[k]]; k++; } return { v, k }; }
      if (UNITES_NOMBRE[toks[0]] !== undefined) return { v: UNITES_NOMBRE[toks[0]], k: 1 };
      return null;
    };
    const r = essayer(tab);
    if (!r) return false;
    // combien de mots d'origine consommés : on recompte
    let restant = r.k, n = 0;
    while (restant > 0 && i + n < m.length) {
      const nb = motsSplit(m[i + n]).filter((p) => p && p !== "et").length;
      restant -= nb; n++;
      if (m[i + n] === "et" && restant > 0) n++;
    }
    prendre(r.v, Math.max(n, 1));
    return true;
  };
  lireDizaine();
  if (!trouve) return null;
  return { valeur: total, mots: i };
}

const MOIS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };

// Date de péremption dictée ou écrite : "12/03/2027", "12 mars 2027",
// "mars 2027" (=> dernier jour du mois), "03/2027". Renvoie "AAAA-MM-JJ" ou null.
export function lireDate(texte) {
  const t = sansAccents(texte);
  const pad = (n) => String(n).padStart(2, "0");
  const fin = (a, m) => `${a}-${pad(m)}-${pad(new Date(a, m, 0).getDate())}`;
  let m = t.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (m) { const a = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return `${a}-${pad(m[2])}-${pad(m[1])}`; }
  m = t.match(/\b(\d{1,2})[\/.-](\d{4})\b/);
  if (m) return fin(+m[2], +m[1]);
  m = t.match(/\b(\d{1,2}|premier|1er)\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})\b/);
  if (m) return `${m[3]}-${pad(MOIS[m[2]])}-${pad(/^\d/.test(m[1]) ? m[1] : 1)}`;
  m = t.match(/\b(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})\b/);
  if (m) return fin(+m[2], MOIS[m[1]]);
  return null;
}

const MOTS_VIDES = new Set(["de", "du", "des", "d", "la", "le", "les", "l", "un", "une", "en", "au", "aux", "et", "avec", "pour", "a"]);
const UNITES_EMBALLAGE = /^(packs?|cartons?|caisses?|bouteilles?|paquets?|boites?|rouleaux?|lots?|sachets?|bidons?|futs?|fut|canettes?|barquettes?|unites?|pieces?|kilos?|kg|litres?|l|bacs?|palettes?|sacs?)$/;

function racine(mot) {
  let w = sansAccents(mot).replace(/[^a-z0-9]/g, "");
  if (w.length > 3 && w.endsWith("s")) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith("x")) w = w.slice(0, -1);
  return w;
}
export function jetons(texte) {
  return sansAccents(texte).split(/[^a-z0-9]+/).filter(Boolean).map(racine).filter((w) => w && !MOTS_VIDES.has(w));
}
function bigrammes(s) {
  const t = ` ${s} `; const out = new Map();
  for (let i = 0; i < t.length - 1; i++) { const b = t.slice(i, i + 2); out.set(b, (out.get(b) || 0) + 1); }
  return out;
}
function dice(a, b) {
  const A = bigrammes(a), B = bigrammes(b); let inter = 0, na = 0, nb = 0;
  for (const [k, v] of A) { na += v; if (B.has(k)) inter += Math.min(v, B.get(k)); }
  for (const v of B.values()) nb += v;
  return na + nb ? (2 * inter) / (na + nb) : 0;
}

// Score 0..1 entre un libellé dicté et un nom/alias connu.
export function scoreLibelle(dicte, connu) {
  const a = jetons(dicte), b = jetons(connu);
  if (!a.length || !b.length) return 0;
  const cle = (x) => x.join(" ");
  if (cle(a) === cle(b)) return 1;
  const sa = new Set(a), sb = new Set(b);
  let communs = 0;
  for (const w of sa) if (sb.has(w)) communs++;
  const jaccard = communs / (sa.size + sb.size - communs);
  // couverture : tous les mots du nom connu apparaissent dans la dictée (ou l'inverse)
  const couvre = communs / Math.min(sa.size, sb.size);
  const d = dice(cle(a), cle(b));
  const base = 0.45 * jaccard + 0.25 * couvre + 0.3 * d;
  // tous les mots dictés se retrouvent dans le nom connu (ou l'inverse) : très probable
  const sousEnsemble = couvre === 1 ? 0.75 + 0.25 * jaccard : 0;
  return Math.min(1, Math.max(base, sousEnsemble));
}

// Meilleurs articles pour un libellé dicté. articles : [{id, nom, alias[]}]
export function rapprocher(libelle, articles, max = 3) {
  const res = [];
  for (const art of articles) {
    let best = scoreLibelle(libelle, art.nom);
    for (const al of art.alias || []) best = Math.max(best, scoreLibelle(libelle, al));
    if (best > 0.25) res.push({ article: art, score: Math.round(best * 100) / 100 });
  }
  res.sort((x, y) => y.score - x.score);
  return res.slice(0, max);
}

// Découpe une dictée en lignes { quantite, unite, libelle, datePeremption, brut }.
// Séparateurs : retour à la ligne, point-virgule, virgule, « puis ».
export function lireDictee(texte) {
  const segments = String(texte || "")
    .replace(/\s+puis\s+/gi, "\n")
    .split(/[\n;,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const lignes = [];
  for (let seg of segments) {
    const brut = seg;
    const datePeremption = lireDate(seg);
    // retire la mention de péremption du libellé
    seg = seg.replace(/\b(p[ée]rim[ée]?s?|dlc|dluo|dlc\/dluo|p[ée]remption|avant le|jusqu'?au)\b.*$/i, "").trim();
    if (datePeremption) seg = seg.replace(/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{1,2}[\/.-]\d{4}/g, "").trim();
    const mots = seg.split(/\s+/).filter(Boolean);
    let quantite = null, i = 0;
    const n = lireNombre(mots);
    if (n) { quantite = n.valeur; i = n.mots; }
    if (n && /^douzaines?$/.test(sansAccents(mots[i] || ""))) { quantite *= 12; i++; }
    let unite = null;
    if (mots[i] && UNITES_EMBALLAGE.test(sansAccents(mots[i]))) { unite = mots[i].toLowerCase(); i++; }
    // « de », « d' »
    let libelle = mots.slice(i).join(" ").replace(/^(de |d'|du |des )/i, "").trim();
    if (!libelle && unite) { libelle = unite; unite = null; }
    if (!libelle) continue;
    lignes.push({ quantite, unite, libelle, datePeremption, brut });
  }
  return lignes;
}

// Dictée + catalogue => propositions à valider à l'écran.
export function analyserDictee(texte, articles) {
  return lireDictee(texte).map((l) => {
    const candidats = rapprocher(l.libelle, articles);
    const sur = candidats[0] && candidats[0].score >= 0.7 && (!candidats[1] || candidats[0].score - candidats[1].score >= 0.1);
    return { ...l, candidats, articleId: sur ? candidats[0].article.id : null, sur: !!sur };
  });
}

// Consommation entre deux inventaires, par article.
//   avant, apres : Map(articleId -> quantité totale)
//   achats : Map(articleId -> quantité achetée entre les deux dates)
export function consommation(avant, apres, achats) {
  const ids = new Set([...avant.keys(), ...apres.keys(), ...achats.keys()]);
  const out = [];
  for (const id of ids) {
    const a = avant.get(id) || 0, p = apres.get(id) || 0, ach = achats.get(id) || 0;
    out.push({ articleId: id, avant: a, achats: ach, apres: p, consomme: a + ach - p });
  }
  return out;
}
