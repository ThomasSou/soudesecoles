// Lecture de l'export CSV des opérations du Crédit Agricole (« Télécharger les
// opérations » dans l'espace de banque en ligne).
//
// Le format observé : fichier en Windows-1252, séparateur « ; », quelques
// lignes de préambule (nom du compte, solde, période), puis l'en-tête
// « Date;Libellé;Débit euros;Crédit euros; ». Le libellé tient sur PLUSIEURS
// lignes entre guillemets (nature de l'opération, puis détail), les montants
// sont à la française (« 1 250,00 », espace de milliers parfois insécable).
//
// Ce module ne dépend de rien : il tourne dans le navigateur (le fichier est
// lu là, seules les opérations sont envoyées au serveur).

// Décode les octets du fichier : Windows-1252 par défaut (ce que produit la
// banque), UTF-8 si le fichier en porte la signature ou s'il est valide UTF-8
// avec des accents.
export function decoderFichier(buffer) {
  const octets = new Uint8Array(buffer);
  const avecBom = octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf;
  if (avecBom) return new TextDecoder("utf-8").decode(octets).replace(/^﻿/, "");
  try {
    const strict = new TextDecoder("utf-8", { fatal: true }).decode(octets);
    // UTF-8 valide : on le garde seulement s'il contient de vrais accents ;
    // un fichier 100 % ASCII se lit pareil dans les deux cas.
    return strict;
  } catch {
    return new TextDecoder("windows-1252").decode(octets);
  }
}

// Lecteur CSV : champs séparés par « ; », guillemets doubles, retours à la
// ligne autorisés dans un champ entre guillemets.
function lireCsv(texte) {
  const lignes = [];
  let ligne = [];
  let champ = "";
  let entreGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          champ += '"';
          i++;
        } else {
          entreGuillemets = false;
        }
      } else {
        champ += c;
      }
    } else if (c === '"') {
      entreGuillemets = true;
    } else if (c === ";") {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = "";
    } else {
      champ += c;
    }
  }
  if (champ !== "" || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes;
}

// « 1 250,00 » -> 125000 (centimes). Vide ou illisible -> null.
export function montantEnCentimes(texte) {
  const propre = String(texte || "")
    .replace(/[\s  ]/g, "")
    .replace(",", ".")
    .replace(/[^0-9.\-]/g, "");
  if (!propre) return null;
  const n = Number(propre);
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) : null;
}

// « 07/09/2026 » -> « 2026-09-07 ».
function dateIso(texte) {
  const m = String(texte || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Forme normalisée d'un libellé pour les comparaisons : minuscules, sans
// accents ni ponctuation, espaces simples.
export function normaliser(texte) {
  return String(texte || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Moyen de paiement déduit de la nature de l'opération (1re ligne du libellé).
export function moyenDepuisType(type) {
  const t = normaliser(type);
  if (t.startsWith("virement")) return "virement";
  if (t.startsWith("prelevement")) return "prelevement";
  if (t.startsWith("cheque")) return "cheque";
  if (t.includes("especes")) return "especes";
  if (t.includes("carte") || t.includes("paiement par carte")) return "cb";
  return "autre";
}

// Analyse le texte d'un export. Renvoie :
//   { compte, intitule, periode: {du, au}, operations: [...], ignorees }
// Chaque opération : { cle, compte, date, type, detail, libelle, sens,
// montantCents }. `cle` identifie l'opération de façon stable : réimporter un
// fichier qui recouvre une période déjà importée ne crée pas de doublon.
export function analyserReleve(texte) {
  const lignes = lireCsv(texte);

  const enTete = lignes.findIndex(
    (l) => /^date$/i.test((l[0] || "").trim()) && l.length >= 4
  );
  if (enTete === -1) {
    return { erreur: "Ce fichier ne ressemble pas à un export d'opérations du Crédit Agricole (colonne « Date » introuvable)." };
  }

  // Préambule : nom du compte et période.
  const preambule = lignes
    .slice(0, enTete)
    .map((l) => l.join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const texteAvant = preambule.join(" | ");
  const compte = /livret|placement|épargne|epargne/i.test(texteAvant) ? "placement" : "courant";
  const intitule = preambule.find((p) => /compte|livret/i.test(p)) || "";
  const mp = texteAvant.match(/entre le (\d{2}\/\d{2}\/\d{4}) et le (\d{2}\/\d{2}\/\d{4})/i);
  const periode = mp ? { du: dateIso(mp[1]), au: dateIso(mp[2]) } : null;

  const operations = [];
  let ignorees = 0;
  const vues = {}; // deux opérations strictement identiques le même jour restent distinctes
  for (const l of lignes.slice(enTete + 1)) {
    const date = dateIso(l[0]);
    if (!date) {
      if (l.some((c) => c.trim())) ignorees++;
      continue;
    }
    const morceaux = String(l[1] || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const type = morceaux[0] || "Opération";
    const detail = morceaux.slice(1).join(" · ");
    const debit = montantEnCentimes(l[2]);
    const credit = montantEnCentimes(l[3]);
    if (!debit && !credit) {
      ignorees++;
      continue;
    }
    const sens = credit && !debit ? "recette" : "depense";
    const montantCents = sens === "recette" ? credit : debit;
    const libelle = detail ? `${type} — ${detail}` : type;

    const base = `${compte}|${date}|${sens}|${montantCents}|${normaliser(libelle)}`;
    vues[base] = (vues[base] || 0) + 1;
    operations.push({
      cle: `${base}|${vues[base]}`,
      compte,
      date,
      type,
      detail,
      libelle,
      sens,
      montantCents,
    });
  }

  return { compte, intitule, periode, operations, ignorees };
}

// Nom de tiers probable, pour pré-remplir « fournisseur » quand on crée une
// ligne depuis une opération. Volontairement approximatif : le bureau corrige.
export function tiersProbable(operation) {
  const detail = String(operation.detail || "").split(" · ")[0] || "";
  let t = detail
    .replace(/^(VIR INST vers|VIR INST|WEB|SEPA|PRLV|VIR)\s+/i, "")
    .replace(/\s+-\s+.*$/, "")
    .trim();
  if (!t || t.length < 3) return "";
  // Les noms de personnes arrivent parfois en majuscules : on adoucit.
  if (t === t.toUpperCase()) {
    t = t.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
  }
  return t.slice(0, 80);
}
