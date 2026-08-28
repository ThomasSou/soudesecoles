#!/usr/bin/env node
/**
 * Transforme les listes d'élèves de l'école en fichier familles.json,
 * prêt à être avalé par scripts/import-familles.mjs.
 *
 * Usage :
 *   node scripts/csv-vers-familles.mjs "chemin/vers/2025 2026" [annee]
 *
 * Exemple :
 *   node scripts/csv-vers-familles.mjs \
 *     "C:/Users/thoma/OneDrive/Documents Sou des Ecoles - Fichiers de_/Administratif/Liste Eleves/2025 2026" \
 *     2025-2026
 *
 * Produit deux fichiers à côté du script :
 *   - familles.json    → à donner à import-familles.mjs
 *   - familles-rapport.txt → les anomalies à relire AVANT d'importer
 *
 * Un parent sans adresse e-mail exploitable (aucune renseignée, ou déjà
 * utilisée par son conjoint dans la même famille) est quand même inclus dans
 * familles.json, avec `email: null` : il obtient une fiche sans compte de
 * connexion (import-familles.mjs sait déjà gérer ce cas), au lieu d'être
 * purement et simplement écarté du fichier.
 *
 * ---------------------------------------------------------------------------
 * D'où viennent les données
 *
 * Deux sources complémentaires, aucune ne suffit seule :
 *
 * 1. Les fichiers par classe ("5 Liste CP.csv", etc.)
 *    Colonnes : Nom responsable ; Prénom responsable ; ... ; Courriel ; ... ;
 *               Classes élèves ; Nom de famille élève ; Prénom élève
 *    → donnent le lien parent ↔ enfant et le nom des enfants,
 *      mais ni adresse ni téléphone.
 *
 * 2. Le fichier Yapla ("Yapla/Liste globale v2 ... .csv")
 *    Colonnes : Nom ; Prénom ; Adresse ; CP ; Commune ; Pays ; Courriel ;
 *               Téléphone portable ; Enfant 1 ; Enfant 2 ; Enfant 3
 *    → donne l'adresse et le téléphone, mais pas le nom des enfants.
 *
 * On reconstitue donc les familles à partir des fichiers par classe, puis on
 * les enrichit avec l'adresse et le téléphone trouvés dans le fichier Yapla,
 * en rapprochant sur l'adresse e-mail.
 *
 * Attention : le fichier nommé "Liste globale 2025 2026.csv" ne contient en
 * réalité que la classe des petits. Il n'est volontairement pas utilisé.
 *
 * ---------------------------------------------------------------------------
 * Comment les familles sont reconstituées
 *
 * Un parent et un enfant sont reliés quand ils apparaissent sur la même ligne.
 * Une famille est un groupe connecté : deux parents inscrits sur le même enfant
 * sont de la même famille, et deux enfants déclarés par le même parent aussi
 * (ce qui rattrape les fratries réparties sur plusieurs classes).
 *
 * Les fichiers sont encodés en Latin-1 (Windows), pas en UTF-8 : c'est pour ça
 * qu'un "é" lu brutalement ressort en "Ã©". Le décodage est fait explicitement.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));

const dossier = process.argv[2];
const anneeScolaire = process.argv[3] || "2025-2026";

if (!dossier) {
  console.error("Usage : node scripts/csv-vers-familles.mjs \"<dossier des listes>\" [annee]");
  process.exit(1);
}

// --- Lecture CSV -----------------------------------------------------------

function lireCsv(chemin) {
  // Les exports de l'école sont en Latin-1 : on décode explicitement.
  const texte = readFileSync(chemin, "latin1");
  return texte
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "" && l.replace(/[";]/g, "").trim() !== "")
    .map((l) =>
      l
        .split(";")
        // Certains exports entourent chaque cellule de guillemets, d'autres non.
        .map((c) => c.trim().replace(/^"(.*)"$/s, "$1").trim())
    );
}

const propre = (s) => (s || "").replace(/\s+/g, " ").trim();
const cleNom = (s) => propre(s).toLocaleUpperCase("fr-FR");

// Applique au passage les corrections d'adresse déjà validées (voir plus bas).
const cleEmail = (s) => {
  const e = propre(s).toLowerCase();
  return CORRECTIONS_VALIDEES[e] || e;
};

// --- Détection des fautes de frappe dans les domaines d'e-mail -------------
//
// On ne corrige jamais tout seul : une adresse erronée fait échouer une
// invitation, mais une adresse "corrigée" à tort l'envoie à un inconnu.
// Le script se contente donc de proposer, et Thomas valide.

const DOMAINES_COURANTS = [
  "gmail.com", "hotmail.fr", "hotmail.com", "outlook.fr", "outlook.com",
  "yahoo.fr", "yahoo.com", "orange.fr", "wanadoo.fr", "free.fr",
  "laposte.net", "sfr.fr", "bbox.fr", "icloud.com", "live.fr", "aol.com",
];

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return d[a.length][b.length];
}

// Corrections déjà validées par Thomas le 21 août 2026, à partir du rapport
// d'anomalies. Elles sont appliquées automatiquement : inutile de les revalider
// à chaque exécution du script.
const CORRECTIONS_VALIDEES = {
  "dimitri.bouillot@gamil.com": "dimitri.bouillot@gmail.com",
  "odet.candice@gamil.com": "odet.candice@gmail.com",
  "yohan.panay@wanafoo.fr": "yohan.panay@wanadoo.fr",
  // Validées le 28 août 2026, à partir du rapport généré ce jour-là.
  "noemiedesharbes@ymail.com": "noemiedesharbes@gmail.com",
  "garnierdu01@ootlook.fr": "garnierdu01@outlook.fr",
  "pierrick.dottori@hormail.fr": "pierrick.dottori@hotmail.fr",
};

// Renvoie l'adresse corrigée proposée, ou null si le domaine semble correct.
function corrigerDomaine(email) {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const local = email.slice(0, at);
  const domaine = email.slice(at + 1);

  if (DOMAINES_COURANTS.includes(domaine)) return null;

  let meilleur = null;
  let meilleureDistance = Infinity;
  for (const d of DOMAINES_COURANTS) {
    const dist = distance(domaine, d);
    if (dist < meilleureDistance) {
      meilleureDistance = dist;
      meilleur = d;
    }
  }

  // Une seule lettre d'écart (deux pour les domaines longs) : très
  // probablement une faute. Au-delà, c'est sans doute un domaine légitime
  // (adresse professionnelle, fournisseur local...) qu'on laisse tranquille.
  const seuil = meilleur.length >= 10 ? 2 : 1;
  return meilleureDistance <= seuil ? `${local}@${meilleur}` : null;
}

// Met un nom en capitales dans une forme lisible : DUPONT -> Dupont,
// en respectant les particules et les noms composés.
function joliNom(s) {
  const t = propre(s);
  if (!t) return "";
  if (t !== t.toLocaleUpperCase("fr-FR")) return t; // déjà en casse mixte
  return t
    .toLocaleLowerCase("fr-FR")
    .replace(/(^|[\s'-])([a-zà-ÿ])/g, (_, sep, c) => sep + c.toLocaleUpperCase("fr-FR"));
}

// --- Structure d'union-find (pour regrouper les familles) -------------------

const parent = new Map();
function racine(x) {
  if (!parent.has(x)) parent.set(x, x);
  while (parent.get(x) !== x) {
    parent.set(x, parent.get(parent.get(x)));
    x = parent.get(x);
  }
  return x;
}
function unir(a, b) {
  const ra = racine(a);
  const rb = racine(b);
  if (ra !== rb) parent.set(ra, rb);
}

// --- Lecture des fichiers par classe ---------------------------------------

const fichiersClasse = readdirSync(dossier)
  .filter((f) => f.toLowerCase().endsWith(".csv"))
  .filter((f) => /^\d+\s/.test(f)) // "1 liste PS.csv", "12 Liste CM2.csv"...
  .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

if (fichiersClasse.length === 0) {
  console.error(`Aucun fichier de classe trouvé dans : ${dossier}`);
  process.exit(1);
}

const anomalies = [];
const corrections = []; // fautes de frappe d'e-mail, à valider par Thomas
const parents = new Map(); // cléParent -> { nom, prenom, email, sources:Set, enfantsLies:Set }
const enfants = new Map(); // cléEnfant -> { nom, prenom, classe }

for (const fichier of fichiersClasse) {
  const lignes = lireCsv(join(dossier, fichier));
  const entete = lignes.shift();

  // On repère les colonnes par leur intitulé plutôt que par leur position.
  //
  // Les exports de l'école ne suivent pas tous le même format : certains
  // contiennent l'adresse et deux enfants par ligne, d'autres se limitent au
  // nom du responsable, et l'un d'eux n'a même pas de colonne prénom.
  // On s'adapte donc à ce qui est réellement présent.
  const idx = (motif) => entete.findIndex((c) => motif.test(c));
  const tousIdx = (motif) =>
    entete.map((c, i) => (motif.test(c) ? i : -1)).filter((i) => i >= 0);

  const cNomResp = idx(/nom responsable/i);
  const cPrenomResp = idx(/pr.nom responsable/i); // peut valoir -1
  const cCourriel = idx(/courriel/i);

  // Un même export peut décrire plusieurs enfants sur la même ligne
  // (fratries) : autant de blocs que de colonnes "Nom de famille élève".
  const colsNomEleve = tousIdx(/nom de famille .l.ve/i);
  const colsPrenomEleve = tousIdx(/pr.nom .l.ve/i);
  const colsClasse = tousIdx(/classes? .l.ves?/i);
  // Seuls les exports maternelle la contiennent ; elle sert à distinguer deux
  // élèves homonymes (même nom, même prénom) là où les exports élémentaire ne
  // fournissent que le nom — cf. plus bas la construction de la clé enfant.
  const colsDateNaissance = tousIdx(/date de naissance/i);

  if (cNomResp < 0 || cCourriel < 0 || colsNomEleve.length === 0) {
    anomalies.push(`IGNORÉ — ${fichier} : colonnes attendues introuvables.`);
    continue;
  }
  if (cPrenomResp < 0) {
    anomalies.push(
      `SANS PRÉNOM — ${fichier} : cet export ne contient pas le prénom des ` +
        `responsables. Les parents y seront enregistrés avec leur nom seul.`
    );
  }

  for (const l of lignes) {
    const nomResp = propre(l[cNomResp]);
    const prenomResp = cPrenomResp >= 0 ? propre(l[cPrenomResp]) : "";
    const email = cleEmail(l[cCourriel]);

    if (!nomResp && !prenomResp) continue;

    // Chaque bloc enfant présent sur la ligne est traité séparément.
    const enfantsLigne = colsNomEleve
      .map((cNom, i) => ({
        nom: propre(l[cNom]),
        prenom: propre(l[colsPrenomEleve[i]]),
        classe: propre(l[colsClasse[i]]),
        dateNaissance: colsDateNaissance[i] !== undefined ? propre(l[colsDateNaissance[i]]) : "",
      }))
      .filter((e) => e.nom || e.prenom);

    if (enfantsLigne.length === 0) continue;

    for (const enfant of enfantsLigne) {
      const nomEleve = enfant.nom;
      const prenomEleve = enfant.prenom;
      const classe = enfant.classe;
      const dateNaissance = enfant.dateNaissance;

    // Un parent est identifié par son e-mail ; à défaut par son nom complet.
    const cleP = email ? `mail:${email}` : `nom:${cleNom(nomResp)} ${cleNom(prenomResp)}`;
    // Un enfant est identifié par son nom + sa date de naissance quand on l'a
    // (exports maternelle) : ça évite de confondre deux élèves homonymes de
    // classes différentes (voir l'incident Léo Granger — PETITS et CM1-CM2 —
    // fusionnés par erreur avant ce correctif, faute d'un identifiant fiable
    // dans les exports élémentaire). Sans date (exports élémentaire), on
    // retombe sur nom + prénom seuls, comme avant.
    const cleE = `enfant:${cleNom(nomEleve)} ${cleNom(prenomEleve)}` + (dateNaissance ? `|${dateNaissance}` : "");

    if (!parents.has(cleP)) {
      parents.set(cleP, {
        nom: joliNom(nomResp),
        prenom: joliNom(prenomResp),
        email,
        sources: new Set(),
        enfantsLies: new Set(),
      });
    }
    const infoParent = parents.get(cleP);
    infoParent.sources.add(fichier);

    if (!enfants.has(cleE)) {
      enfants.set(cleE, {
        nom: joliNom(nomEleve),
        prenom: joliNom(prenomEleve),
        classe,
        identifieParDate: Boolean(dateNaissance),
        vuAvecClasses: new Set(),
      });
    }
    const infoEnfant = enfants.get(cleE);
    if (classe) infoEnfant.vuAvecClasses.add(classe);

    unir(cleP, cleE);

      if (!email) {
        anomalies.push(
          `SANS E-MAIL — ${joliNom(prenomResp)} ${joliNom(nomResp)} `.replace(/\s+/g, " ") +
            `(enfant : ${joliNom(prenomEleve)} ${joliNom(nomEleve)}, ${classe}) ` +
            `: fiche créée sans compte de connexion (pas d'invitation possible).`
        );
        // Sans e-mail, seul le nom distingue deux parents différents. Si ce
        // même nom se retrouve relié à plusieurs enfants, impossible de
        // savoir automatiquement s'il s'agit d'une fratrie réelle ou de deux
        // parents homonymes fusionnés à tort — à vérifier avant import.
        infoParent.enfantsLies.add(`${joliNom(prenomEleve)} ${joliNom(nomEleve)} (${classe})`);
      }
    }
  }
}

// --- Détection des regroupements ambigus ------------------------------------
//
// Deux risques bien distincts, à ne jamais laisser passer sans relecture :
//
// 1. Un même enfant (nom+prénom) vu avec deux classes différentes : soit il a
//    changé de classe en cours d'année (rare), soit ce sont en réalité deux
//    élèves homonymes qu'on est en train de confondre en un seul.
for (const [, e] of enfants) {
  if (e.vuAvecClasses.size <= 1) continue;
  if (e.identifieParDate) {
    // Même enfant confirmé par la date de naissance (les deux lignes
    // concordent) : la classe est juste mal renseignée sur l'une des deux
    // lignes (ex. classe double niveau notée différemment par chaque
    // parent) — pas un risque d'homonyme, juste à corriger la classe.
    anomalies.push(
      `CLASSE INCOHÉRENTE — l'élève ${e.prenom} ${e.nom} (même date de naissance) est noté dans deux ` +
        `classes différentes selon la ligne (${[...e.vuAvecClasses].join(", ")}) — probablement une classe à ` +
        `double niveau désignée différemment par chaque parent. Choisis la bonne classe dans scripts/familles.json.`
    );
  } else {
    anomalies.push(
      `VÉRIFIER — l'élève ${e.prenom} ${e.nom} apparaît avec plusieurs classes différentes ` +
        `(${[...e.vuAvecClasses].join(", ")}), sans date de naissance pour trancher : vérifier qu'il ne s'agit ` +
        `pas de deux élèves homonymes plutôt qu'un seul, avant d'importer.`
    );
  }
}

// 2. Un parent identifié seulement par son nom (aucun e-mail exploitable,
//    donc rien d'autre pour le distinguer d'un homonyme) relié à plusieurs
//    enfants différents. C'est normal pour une vraie fratrie ; mais si ce
//    sont deux parents différents qui portent le même nom, ce regroupement
//    fusionnerait à tort deux familles distinctes en une seule.
for (const [cle, p] of parents) {
  if (!cle.startsWith("nom:")) continue;
  if (p.enfantsLies.size > 1) {
    anomalies.push(
      `VÉRIFIER — ${p.prenom ? p.prenom + " " : ""}${p.nom} (sans e-mail) est relié à plusieurs ` +
        `enfants : ${[...p.enfantsLies].join(", ")}. Si c'est bien une fratrie, tout va bien ; ` +
        `si ce sont deux parents homonymes, ils ont été fusionnés à tort en une seule famille — ` +
        `à corriger dans scripts/familles.json avant import.`
    );
  }
}

// --- Enrichissement adresse / téléphone via le fichier Yapla ---------------

const coordonnees = new Map(); // email -> { adresse, cp, ville, telephone }
try {
  const dossierYapla = join(dossier, "Yapla");
  const fichierYapla = readdirSync(dossierYapla)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    // On privilégie la version la plus récente si plusieurs existent.
    .sort()
    .reverse()
    .find((f) => /v2|globale/i.test(f));

  if (fichierYapla) {
    const lignes = lireCsv(join(dossierYapla, fichierYapla));
    const entete = lignes.shift();
    const idx = (motif) => entete.findIndex((c) => motif.test(c));
    const cAdr = idx(/adresse/i);
    const cCp = idx(/^cp/i);
    const cVille = idx(/commune/i);
    const cMail = idx(/courriel/i);
    const cTel = idx(/t.l.phone/i);

    for (const l of lignes) {
      const email = cleEmail(l[cMail]);
      if (!email) continue;
      coordonnees.set(email, {
        adresse: propre(l[cAdr]),
        // Les CP perdent parfois leur zéro initial en passant par Excel — mais
        // un CP réellement vide ne doit pas devenir "00000".
        cp: propre(l[cCp]) ? propre(l[cCp]).padStart(5, "0") : "",
        ville: propre(l[cVille]),
        telephone: propre(l[cTel]),
      });
    }
  } else {
    anomalies.push("Fichier Yapla introuvable : aucune adresse ni téléphone ne sera renseigné.");
  }
} catch {
  anomalies.push("Dossier Yapla illisible : aucune adresse ni téléphone ne sera renseigné.");
}

// --- Constitution des familles ---------------------------------------------

const groupes = new Map();
for (const cle of [...parents.keys(), ...enfants.keys()]) {
  const r = racine(cle);
  if (!groupes.has(r)) groupes.set(r, []);
  groupes.get(r).push(cle);
}

const familles = [];
const emailsVus = new Map(); // email -> "Prénom Nom" du premier porteur

for (const membres of groupes.values()) {
  const sesParents = membres.filter((m) => parents.has(m)).map((m) => parents.get(m));
  const sesEnfants = membres.filter((m) => enfants.has(m)).map((m) => enfants.get(m));

  if (sesParents.length === 0 || sesEnfants.length === 0) continue;

  // Adresse : première trouvée parmi les parents de la famille.
  let coord = null;
  for (const p of sesParents) {
    if (p.email && coordonnees.has(p.email)) {
      coord = coordonnees.get(p.email);
      break;
    }
  }

  const nomFamille = sesEnfants[0].nom;

  if (!coord) {
    anomalies.push(`SANS ADRESSE — famille ${nomFamille} : adresse et téléphone non renseignés.`);
  }

  // Une même adresse e-mail ne peut pas servir à deux comptes : Supabase Auth
  // l'interdit. Un parent sans e-mail exploitable (aucun renseigné, ou déjà
  // pris par son conjoint dans cette même famille) obtient quand même une
  // fiche, mais sans compte de connexion — à compléter à la main plus tard
  // si besoin (voir "Consigne Claude Code - fiches parents sans compte").
  const parentsRetenus = [];
  for (const p of sesParents) {
    const emailDejaPris = p.email && emailsVus.has(p.email);
    if (emailDejaPris) {
      anomalies.push(
        `E-MAIL EN DOUBLE — ${p.prenom} ${p.nom} partage ${p.email} avec ` +
          `${emailsVus.get(p.email)} : fiche créée sans compte de connexion.`
      );
    }

    if (p.email && !emailDejaPris) {
      emailsVus.set(p.email, `${p.prenom} ${p.nom}`);

      // Fautes de frappe sur le domaine : on propose, on ne corrige pas.
      const suggestion = corrigerDomaine(p.email);
      if (suggestion) {
        corrections.push({
          qui: `${p.prenom} ${p.nom}`,
          famille: nomFamille,
          actuel: p.email,
          propose: suggestion,
        });
      }
    }

    const emailRetenu = emailDejaPris ? null : p.email || null;
    parentsRetenus.push({
      firstName: p.prenom,
      lastName: p.nom,
      email: emailRetenu,
      phone: (emailRetenu && coordonnees.get(emailRetenu)?.telephone) || "",
    });
  }

  // Dédoublonnage : un "parent" sans prénom NI e-mail qui partage le nom de
  // famille d'un autre parent déjà identifié dans cette même famille est
  // presque à coup sûr la même personne, réapparue via le fichier CM1-CM2
  // qui n'a pas de colonne prénom (11 Liste CM1-CM2.csv) — pas un deuxième
  // parent distinct. On le retire plutôt que de créer une fiche en double
  // pour la même personne physique. On ne fusionne jamais deux parents qui
  // ont chacun un prénom ou un e-mail : seul un doublon sans AUCUN
  // identifiant propre est retiré.
  const parentsFinal = parentsRetenus.filter((p) => {
    if (p.firstName || p.email) return true;
    const doublonProbable = parentsRetenus.some(
      (autre) => autre !== p && autre.lastName === p.lastName && (autre.firstName || autre.email)
    );
    if (doublonProbable) {
      anomalies.push(
        `DOUBLON RETIRÉ — un parent "${p.lastName}" sans prénom ni e-mail a été retiré de la famille ` +
          `${nomFamille} : très probablement la même personne qu'un autre parent "${p.lastName}" déjà identifié ` +
          `dans cette famille (réapparu via un export sans colonne prénom).`
      );
      return false;
    }
    return true;
  });

  // Garde-fou : une famille n'a jamais plus de deux parents. Au-delà, c'est
  // presque certainement deux familles distinctes fusionnées par erreur
  // (typiquement via un enfant homonyme) — voir l'incident Léo Granger — ou,
  // plus rarement, une vraie famille recomposée à vérifier quand même.
  if (parentsFinal.length > 2) {
    anomalies.push(
      `VÉRIFIER — la famille ${nomFamille} a ${parentsFinal.length} parents ` +
        `(${parentsFinal.map((p) => `${p.firstName} ${p.lastName}`).join(", ")}) : ` +
        `une famille en a rarement plus de deux — vérifier qu'il ne s'agit pas d'une fusion ` +
        `erronée de deux familles distinctes (sinon, famille recomposée légitime, rien à faire).`
    );
  }

  familles.push({
    addressLine: coord?.adresse || "",
    postalCode: coord?.cp || "",
    city: coord?.ville || "",
    schoolYear: anneeScolaire,
    parents: parentsFinal,
    children: sesEnfants.map((e) => ({
      firstName: e.prenom,
      lastName: e.nom,
      classLevel: e.classe,
      teacherName: "",
    })),
  });
}

familles.sort((a, b) =>
  (a.children[0]?.lastName || "").localeCompare(b.children[0]?.lastName || "", "fr")
);

// --- Écriture --------------------------------------------------------------

const sortieJson = join(ICI, "familles.json");
const sortieRapport = join(ICI, "familles-rapport.txt");
const sortieRecap = join(ICI, "familles-recap.csv");

writeFileSync(sortieJson, JSON.stringify(familles, null, 2), "utf8");

// Tableau récapitulatif : une ligne par famille, à ouvrir dans Excel pour une
// relecture finale et à garder comme trace de ce qui a été importé.
const celluleCsv = (v) => `"${(v ?? "").toString().replace(/"/g, '""')}"`;
const ligneRecapCsv = (champs) => champs.map(celluleCsv).join(";");
const lignesRecap = [
  ligneRecapCsv([
    "Adresse",
    "CP",
    "Ville",
    "Parent 1",
    "E-mail 1",
    "Téléphone 1",
    "Parent 2",
    "E-mail 2",
    "Téléphone 2",
    "Autres parents (alerte si présent)",
    "Enfants",
  ]),
  ...familles.map((f) => {
    const [p1, p2, ...pAutres] = f.parents;
    const nomParent = (p) => (p ? `${p.firstName} ${p.lastName}`.trim() : "");
    return ligneRecapCsv([
      f.addressLine,
      f.postalCode,
      f.city,
      nomParent(p1),
      p1?.email || "",
      p1?.phone || "",
      nomParent(p2),
      p2?.email || "",
      p2?.phone || "",
      pAutres.map(nomParent).join(", "),
      f.children.map((c) => `${c.firstName} ${c.lastName} (${c.classLevel || "?"})`).join(", "),
    ]);
  }),
];
writeFileSync(sortieRecap, "﻿" + lignesRecap.join("\r\n"), "utf8");

const tousLesParents = familles.flatMap((f) => f.parents);
const nbParents = tousLesParents.length;
const nbParentsSansCompte = tousLesParents.filter((p) => !p.email).length;
const nbEnfants = familles.reduce((s, f) => s + f.children.length, 0);

const anomaliesAVerifier = anomalies.filter((a) => a.startsWith("VÉRIFIER") || a.startsWith("CLASSE INCOHÉRENTE"));
const autresAnomalies = anomalies.filter((a) => !anomaliesAVerifier.includes(a));

const rapport = [
  `Reconstitution des familles — année ${anneeScolaire}`,
  `Généré le ${new Date().toLocaleString("fr-FR")}`,
  ``,
  `Fichiers de classe lus : ${fichiersClasse.length}`,
  `Corrections d'adresse déjà validées et appliquées : ${Object.keys(CORRECTIONS_VALIDEES).length}`,
  `Familles reconstituées : ${familles.length}`,
  `Parents (total)        : ${nbParents}`,
  `  dont sans compte (pas d'e-mail exploitable) : ${nbParentsSansCompte}`,
  `Enfants                : ${nbEnfants}`,
  ``,
  `--- ⚠ REGROUPEMENTS À VÉRIFIER AVANT IMPORT (${anomaliesAVerifier.length}) ---`,
  ``,
  `Un même nom pourrait désigner deux personnes différentes (parent sans`,
  `e-mail) ou un même enfant apparaître dans deux classes (homonymes) : sans`,
  `correction indépendante, impossible de trancher automatiquement. Relis`,
  `chaque ligne un par un avant de lancer l'import.`,
  ``,
  ...(anomaliesAVerifier.length ? anomaliesAVerifier.map((a) => `• ${a}`) : ["Aucun cas détecté."]),
  ``,
  `--- ADRESSES E-MAIL À VALIDER (${corrections.length}) ---`,
  ``,
  `Corrections proposées, non appliquées. Vérifie chaque ligne, puis corrige`,
  `directement dans scripts/familles.json avant de lancer l'import.`,
  ``,
  ...(corrections.length
    ? corrections.map(
        (c) =>
          `• ${c.qui} (famille ${c.famille})\n` +
          `    actuel  : ${c.actuel}\n` +
          `    proposé : ${c.propose}`
      )
    : ["Aucune adresse suspecte."]),
  ``,
  `--- AUTRES POINTS À RELIRE (${autresAnomalies.length}) ---`,
  ``,
  ...(autresAnomalies.length ? autresAnomalies.map((a) => `• ${a}`) : ["Aucune anomalie détectée."]),
].join("\n");

writeFileSync(sortieRapport, rapport, "utf8");

console.log(rapport);
console.log(`\nFichier écrit : ${sortieJson}`);
console.log(`Rapport écrit : ${sortieRapport}`);
console.log(`Récapitulatif (Excel) écrit : ${sortieRecap}`);
console.log(`\nRelis le rapport, corrige si besoin, puis :`);
console.log(`  node scripts/import-familles.mjs scripts/familles.json`);
