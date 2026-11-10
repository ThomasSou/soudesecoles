// Niveaux individuels des élèves d'élémentaire, lus dans la « Liste simple des
// élèves par classe » éditée par l'école (PDF). Seuls le nom, le prénom, la
// classe et le niveau sont retenus : la date de naissance et le sexe présents
// dans le PDF sont ignorés et jamais enregistrés.
//
// Le texte extrait du PDF colle le nom et le prénom (« DERMOUNMelwan ») : on ne
// tente donc pas de les séparer, on compare la suite « nom + prénom » (ou
// « prénom + nom ») avec celle de chaque enfant du site, sans accents,
// majuscules, espaces ni tirets.

const NIVEAUX = "CP|CE1|CE2|CM1|CM2";
const RE_ELEVE = new RegExp(`^(.+?)(\\d{2}/\\d{2}/\\d{4})([MF])(${NIVEAUX})$`);
const RE_CLASSE = new RegExp(`^(${NIVEAUX})(?:-(${NIVEAUX}))?(?:\\s.*)?$`);

export function cleNom(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Texte du PDF -> [{ brut, cle, niveau, classe }]. Dans le texte extrait,
// l'intitulé de la classe (« CE1-CE2 ») vient APRÈS ses élèves.
export function lireListeEcole(texte) {
  const eleves = [];
  let enAttente = [];
  for (const ligne of String(texte || "").split(/\r?\n/).map((l) => l.trim())) {
    if (!ligne) continue;
    const e = RE_ELEVE.exec(ligne);
    if (e) {
      enAttente.push({ brut: e[1].trim(), cle: cleNom(e[1]), niveau: e[4] });
      continue;
    }
    const c = RE_CLASSE.exec(ligne);
    if (c && enAttente.length > 0) {
      const classe = c[2] ? `${c[1]}-${c[2]}` : c[1];
      for (const el of enAttente) eleves.push({ ...el, classe });
      enAttente = [];
    }
  }
  // Élèves sans intitulé de classe retrouvé : on les garde, classe inconnue.
  for (const el of enAttente) eleves.push({ ...el, classe: null });
  return eleves;
}

const estElementaire = (classe) => new RegExp(`^(${NIVEAUX})(-|$)`, "i").test(String(classe || "").trim());

// Rapproche la liste de l'école des enfants du site (année en cours).
// `enfants` : { id, first_name, last_name, class_level, niveau }.
export function rapprocherNiveaux(eleves, enfants) {
  const parCle = new Map();
  const ajouter = (cle, enfant) => {
    if (!cle) return;
    const l = parCle.get(cle) || [];
    if (!l.includes(enfant)) l.push(enfant);
    parCle.set(cle, l);
  };
  for (const c of enfants) {
    ajouter(cleNom(`${c.last_name}${c.first_name}`), c);
    ajouter(cleNom(`${c.first_name}${c.last_name}`), c);
  }

  const maj = []; // { enfant, niveau, classeListe }
  const dejaAJour = [];
  const nonRetrouves = [];
  const ambigus = [];
  const vus = new Set();

  for (const el of eleves) {
    const trouves = parCle.get(el.cle) || [];
    if (trouves.length === 0) {
      nonRetrouves.push(el);
    } else if (trouves.length > 1) {
      ambigus.push(el);
    } else {
      const enfant = trouves[0];
      vus.add(enfant.id);
      const entree = { enfant, niveau: el.niveau, classeListe: el.classe };
      if ((enfant.niveau || null) === el.niveau) dejaAJour.push(entree);
      else maj.push(entree);
    }
  }

  const tous = [...maj, ...dejaAJour];
  const classeDifferente = tous.filter(
    (e) => e.classeListe && cleNom(e.enfant.class_level) !== cleNom(e.classeListe)
  );
  const elementairesAbsents = enfants.filter((c) => estElementaire(c.class_level) && !vus.has(c.id));

  return { maj, dejaAJour, nonRetrouves, ambigus, classeDifferente, elementairesAbsents };
}
