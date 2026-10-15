import { normaliser, moyenDepuisType } from "./releveCA";

// Rapprochement entre les opérations du relevé bancaire (`compta_operations`)
// et les lignes de comptabilité saisies (`compta_lignes`).
//
// Une opération peut être répartie sur PLUSIEURS lignes (table de liaison
// `compta_operation_lignes`) : elle est « pointée » quand la somme de ses
// lignes égale son montant, « à pointer » tant qu'il reste une part.
//
// Pointage AUTOMATIQUE : seulement quand la concordance est sûre (même sens,
// même montant ET un seul candidat crédible). Dans tous les autres cas, les
// candidats sont proposés au bureau, qui tranche. Mieux vaut un pointage
// manuel de trop qu'un pointage automatique faux qui fausse les comptes en
// silence.

// Mots trop fréquents pour prouver qu'un libellé de banque parle du même
// fournisseur qu'une ligne saisie.
const MOTS_BANALS = new Set([
  "foire", "facture", "fact", "location", "remboursement", "rbmt", "rmbt", "rbt", "vir", "inst",
  "vers", "virement", "paiement", "achat", "achats", "frais", "sou", "ecole", "ecoles", "laique",
  "laiques", "association", "fete", "noel", "marche", "loto", "tombola", "classe", "sas", "sarl",
  "france", "mairie", "commande", "materiel", "fonctionnement", "caisse", "cheque", "especes",
  "montmerle", "lurcy", "saone", "pour", "avec", "dans", "chez", "les", "des", "une", "web",
]);

const joursEntre = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);

// Mots significatifs (≥ 4 lettres, hors mots banals) d'un nom ou d'un libellé.
function motsCles(texte) {
  return normaliser(texte)
    .split(" ")
    .filter((m) => m.length >= 4 && !MOTS_BANALS.has(m) && !/^\d+$/.test(m));
}

// Candidats pour une opération : lignes de même sens et de même montant que
// la part RESTANT à répartir (op.montant_cents), avec un score et les raisons
// affichées au bureau.
//   noms : { [parentId]: "prénom nom" } pour reconnaître le bénévole remboursé.
export function candidatsPourOperation(op, lignes, noms = {}) {
  const texteOp = normaliser(`${op.libelle || ""} ${op.detail || ""}`);
  const resultats = [];
  for (const l of lignes) {
    if (l.sens !== op.sens || l.montant_cents !== op.montant_cents) continue;
    let score = 0;
    const raisons = ["même montant"];

    const mots = new Set([
      ...motsCles(l.fournisseur),
      ...(l.paye_par === "benevole" && l.paye_par_parent_id ? motsCles(noms[l.paye_par_parent_id]) : []),
    ]);
    const trouves = [...mots].filter((m) => texteOp.includes(m));
    if (trouves.length > 0) {
      score += 4;
      raisons.push(`nom reconnu (${trouves[0]})`);
    }

    const dateLigne = l.paiement_le || l.date_operation;
    if (dateLigne) {
      const j = joursEntre(op.date_operation, dateLigne);
      if (j <= 10) {
        score += 2;
        raisons.push("date proche");
      } else if (j <= 45) {
        score += 1;
      } else if (j > 120) {
        score -= 2;
      }
    }

    // Un prévisionnel (devis) n'est pas une dépense réalisée : proposé, jamais
    // pointé automatiquement.
    if (l.statut === "prevu") score -= 1;

    resultats.push({ ligne: l, score, raisons, auto_ok: l.statut === "a_verifier" });
  }
  return resultats.sort((a, b) => b.score - a.score);
}

// Décide si le meilleur candidat peut être pointé sans validation humaine.
export function candidatAutomatique(candidats) {
  const sures = candidats.filter((c) => c.auto_ok);
  if (sures.length === 0) return null;
  const meilleur = sures[0];
  // Nom reconnu et un seul candidat avec un nom reconnu.
  const avecNom = sures.filter((c) => c.raisons.some((r) => r.startsWith("nom reconnu")));
  if (avecNom.length === 1) return avecNom[0];
  // Aucun nom reconnu : on n'accepte que l'unique candidat du montant, à une
  // date proche — jamais de choix entre plusieurs montants identiques.
  if (avecNom.length === 0 && sures.length === 1 && candidats.length === 1 && meilleur.score >= 2) {
    return meilleur;
  }
  return null;
}

// Liens opération <-> lignes : { parOperation: { [opId]: [{ligne_id, montant_cents}] }, prises: Set }.
// `absente` = true tant que la migration 0055 n'est pas passée.
export async function chargerLiens(admin) {
  const { data, error } = await admin
    .from("compta_operation_lignes")
    .select("operation_id, ligne_id, montant_cents");
  if (error) {
    const absente =
      /compta_operation_lignes/.test(error.message || "") &&
      /(does not exist|schema cache|could not find)/i.test(error.message || "");
    return { absente, erreur: error.message, parOperation: {}, prises: new Set() };
  }
  const parOperation = {};
  const prises = new Set();
  for (const l of data || []) {
    (parOperation[l.operation_id] ||= []).push(l);
    prises.add(l.ligne_id);
  }
  return { absente: false, parOperation, prises };
}

export const sommeLiens = (liens) => (liens || []).reduce((s, l) => s + l.montant_cents, 0);

const COLONNES_PAIEMENT = ["paiement_statut", "moyen_paiement", "paiement_le"];

// Rapproche une opération d'une ligne de compta, des deux côtés. La ligne
// peut ne couvrir qu'une PART de l'opération (tant que la somme ne dépasse
// pas le montant). Renvoie { ok, complete } ou { error }.
export async function appliquerPointage(admin, op, ligne, parentId, mode) {
  const { data: liensExistants, error: eLiens } = await admin
    .from("compta_operation_lignes")
    .select("ligne_id, montant_cents")
    .eq("operation_id", op.id);
  if (eLiens) return { error: eLiens.message };
  const deja = sommeLiens(liensExistants);
  const reste = op.montant_cents - deja;
  if (ligne.montant_cents > reste) {
    return {
      error: `Cette ligne (${(ligne.montant_cents / 100).toFixed(2)} €) dépasse ce qui reste à répartir sur l'opération (${(reste / 100).toFixed(2)} €).`,
    };
  }

  const { error: eLien } = await admin
    .from("compta_operation_lignes")
    .insert({ operation_id: op.id, ligne_id: ligne.id, montant_cents: ligne.montant_cents });
  if (eLien) {
    return {
      error: /duplicate|unique/i.test(eLien.message || "")
        ? "Cette ligne est déjà pointée avec une autre opération."
        : eLien.message,
    };
  }

  const maintenant = new Date().toISOString();
  const maj = {
    statut: "pointe",
    pointe_le: maintenant,
    pointe_par: parentId,
    compte: op.compte,
    ref_bancaire: String(op.libelle || "").slice(0, 300),
  };
  if (!ligne.date_operation) maj.date_operation = op.date_operation;

  // Dépense saisie à la main et réglée par le Sou : le relevé prouve qu'elle
  // est payée, et dit comment.
  const concernePaiement =
    ligne.sens === "depense" && ligne.source === "manuel" && (ligne.paye_par || "sou") !== "benevole";
  const majAvecPaiement = concernePaiement
    ? {
        ...maj,
        paiement_statut: "paye",
        moyen_paiement: moyenDepuisType(op.type_operation),
        paiement_le: op.date_operation,
      }
    : maj;

  let { error } = await admin.from("compta_lignes").update(majAvecPaiement).eq("id", ligne.id);
  // Migration 0049 pas encore passée : on pointe quand même, sans l'état de paiement.
  if (error && concernePaiement && COLONNES_PAIEMENT.some((c) => error.message?.includes(c))) {
    ({ error } = await admin.from("compta_lignes").update(maj).eq("id", ligne.id));
  }
  if (error) {
    await admin.from("compta_operation_lignes").delete().eq("operation_id", op.id).eq("ligne_id", ligne.id);
    return { error: error.message };
  }

  // Avance d'un bénévole : le virement du Sou vers lui vaut remboursement.
  if (ligne.paye_par === "benevole" && ligne.sens === "depense" && !ligne.rembourse_le) {
    const { error: eRemb } = await admin
      .from("compta_lignes")
      .update({ rembourse_le: maintenant, rembourse_par: parentId })
      .eq("id", ligne.id);
    if (!eRemb && ligne.reimbursement_request_id) {
      await admin
        .from("reimbursement_requests")
        .update({ status: "reimbursed", processed_at: maintenant, processed_by: parentId })
        .eq("id", ligne.reimbursement_request_id);
    }
  }

  const complete = deja + ligne.montant_cents === op.montant_cents;
  if (complete) {
    const { error: eOp } = await admin
      .from("compta_operations")
      .update({ statut: "pointee", mode_pointage: mode, pointee_le: maintenant, pointee_par: parentId })
      .eq("id", op.id);
    if (eOp) return { error: eOp.message };
  }
  return { ok: true, complete };
}

// Remet une ligne de compta « à pointer » (utilisé quand on détache).
async function liberLigne(admin, ligneId) {
  await admin
    .from("compta_lignes")
    .update({ statut: "a_verifier", pointe_le: null, pointe_par: null, ref_bancaire: null })
    .eq("id", ligneId);
}

// Détache UNE ligne d'une opération (ou toutes si ligneId est omis). Les
// lignes redeviennent « à pointer » ; l'état « payée » posé au pointage reste
// (à corriger à la main sur la ligne si besoin). L'opération repasse « à pointer ».
export async function detacher(admin, op, ligneId = null) {
  let requete = admin.from("compta_operation_lignes").select("ligne_id").eq("operation_id", op.id);
  if (ligneId) requete = requete.eq("ligne_id", ligneId);
  const { data: liens, error } = await requete;
  if (error) return { error: error.message };
  for (const l of liens || []) {
    await admin.from("compta_operation_lignes").delete().eq("operation_id", op.id).eq("ligne_id", l.ligne_id);
    await liberLigne(admin, l.ligne_id);
  }
  const { error: eOp } = await admin
    .from("compta_operations")
    .update({ statut: "a_pointer", mode_pointage: null, note: "reouverte", pointee_le: null, pointee_par: null })
    .eq("id", op.id);
  if (eOp) return { error: eOp.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// APPRENTISSAGE : une opération qui revient (frais bancaires, abonnement,
// prélèvement mensuel…) est classée comme la fois précédente.
//
// Le « modèle » d'une opération vient de l'historique : les opérations déjà
// pointées avec UNE seule ligne (ou écartées) qui portent la même signature
// (nature de l'opération + nom du tiers, sans les numéros de facture ni les
// références qui changent à chaque fois). Le modèle n'existe que si toutes les
// fois précédentes ont été classées pareil : au moindre désaccord, on ne
// devine rien.
//
// - Opérations « automatiques » de la banque (prélèvement, abonnement, frais,
//   commission…) : la ligne est créée et pointée toute seule.
// - Toutes les autres (virements, etc.) : le modèle est seulement PROPOSÉ,
//   d'un clic. Jamais pour les espèces ni les chèques (le libellé ne dit rien
//   de leur destination).
// ---------------------------------------------------------------------------

const TYPES_AUTOMATIQUES = ["prelevement", "abonnement", "retro", "frais", "commission", "agios", "interets", "cotisation"];
const TYPES_NON_APPRIS = ["especes", "cheque"];

export function signatureOperation(op) {
  const type = normaliser(op.type_operation || "");
  if (TYPES_NON_APPRIS.some((t) => type.includes(t))) return null;
  const premier = String(op.detail || "").split(" · ")[0];
  const mots = normaliser(premier)
    .split(" ")
    .filter((m) => m && !/\d/.test(m));
  if (mots.length < 2) return null;
  return `${op.sens}|${type}|${mots.join(" ")}`.slice(0, 200);
}

export const estOperationAutomatique = (op) => {
  const type = normaliser(op.type_operation || "");
  return TYPES_AUTOMATIQUES.some((t) => type.startsWith(t));
};

// Libellé proposé par défaut pour une ligne créée depuis une opération (le
// même que celui pré-rempli dans le formulaire du bureau).
export const libelleParDefaut = (op) => (op.detail || op.libelle || "").split(" · ")[0];

// Exercice d'une date : du 1er septembre au 31 août.
export function exerciceDeLaDate(dateIso) {
  const y = Number(String(dateIso).slice(0, 4));
  const m = Number(String(dateIso).slice(5, 7));
  const debut = m >= 9 ? y : y - 1;
  return `${debut}-${debut + 1}`;
}

// Historique des classements : Map signature -> modèle.
//   { kind: "ligne", rubrique, evenements, classes, libelle, fournisseur, fois }
//   { kind: "ignorer", note, fois }
export async function chargerModeles(admin) {
  const { data: ops } = await admin
    .from("compta_operations")
    .select("*")
    .in("statut", ["pointee", "ignoree"])
    .order("date_operation", { ascending: false })
    .limit(3000);
  if (!ops || ops.length === 0) return new Map();

  const liens = await chargerLiens(admin);
  if (liens.absente) return new Map();

  // Une seule ligne par opération pointée.
  const pointees = ops.filter(
    (o) => o.statut === "pointee" && (liens.parOperation[o.id] || []).length === 1
  );
  const idsLignes = pointees.map((o) => liens.parOperation[o.id][0].ligne_id);
  const lignes = {};
  const evenements = {};
  const classes = {};
  for (let i = 0; i < idsLignes.length; i += 150) {
    const lot = idsLignes.slice(i, i + 150);
    const [{ data: ls }, { data: es }, { data: cs }] = await Promise.all([
      admin.from("compta_lignes").select("*").in("id", lot),
      admin.from("compta_ligne_evenements").select("ligne_id, evenement_id").in("ligne_id", lot),
      admin.from("compta_ligne_classes").select("ligne_id, class_label").in("ligne_id", lot),
    ]);
    for (const l of ls || []) lignes[l.id] = l;
    for (const e of es || []) (evenements[e.ligne_id] ||= []).push(e.evenement_id);
    for (const c of cs || []) (classes[c.ligne_id] ||= []).push(c.class_label);
  }

  const parSignature = new Map();
  for (const o of ops) {
    const sig = signatureOperation(o);
    if (!sig) continue;
    let entree;
    if (o.statut === "ignoree") {
      entree = { cle: "ignorer", kind: "ignorer", note: o.note || null };
    } else {
      if (!liens.parOperation[o.id] || liens.parOperation[o.id].length !== 1) {
        entree = { cle: "autre", kind: "autre" }; // répartie : on n'apprend pas
      } else {
        const l = lignes[liens.parOperation[o.id][0].ligne_id];
        if (!l || (l.paye_par || "sou") !== "sou" || l.source !== "manuel") {
          entree = { cle: "autre", kind: "autre" };
        } else {
          const evts = [...new Set(evenements[l.id] || (l.evenement_id ? [l.evenement_id] : []))].sort();
          const cls = [...new Set(classes[l.id] || [])].sort();
          const incomplet = (l.rubrique === "evenement" && evts.length === 0) || (l.rubrique === "classe" && cls.length === 0);
          entree = incomplet
            ? { cle: "autre", kind: "autre" }
            : {
                cle: `${l.rubrique}|${evts.join(",")}|${cls.join(",")}`,
                kind: "ligne",
                rubrique: l.rubrique,
                evenements: evts,
                classes: cls,
                // Libellé repris tel quel seulement s'il a été retouché à la
                // main ; sinon on repart du libellé de la nouvelle opération.
                libelle: normaliser(l.libelle) === normaliser(libelleParDefaut(o)) ? null : l.libelle,
                fournisseur: l.fournisseur,
              };
        }
      }
    }
    (parSignature.get(sig) || parSignature.set(sig, []).get(sig)).push(entree);
  }

  const modeles = new Map();
  for (const [sig, entrees] of parSignature) {
    const [premiere] = entrees; // la plus récente
    if (premiere.kind === "autre") continue;
    if (!entrees.every((e) => e.cle === premiere.cle)) continue; // désaccord : on ne devine pas
    modeles.set(sig, { ...premiere, fois: entrees.length });
  }
  return modeles;
}

// Crée la ligne décrite par le modèle et la pointe avec l'opération (ou
// écarte l'opération si le modèle dit « écartée »).
export async function appliquerModele(admin, op, modele, parentId, mode) {
  if (modele.kind === "ignorer") {
    const { error } = await admin
      .from("compta_operations")
      .update({
        statut: "ignoree",
        note: modele.note || "Écartée comme la fois précédente",
        mode_pointage: null,
        pointee_le: new Date().toISOString(),
        pointee_par: parentId,
      })
      .eq("id", op.id);
    return error ? { error: error.message } : { ok: true, ecartee: true };
  }

  const { data: ligne, error } = await admin
    .from("compta_lignes")
    .insert({
      sens: op.sens,
      rubrique: modele.rubrique,
      evenement_id: modele.rubrique === "evenement" ? modele.evenements[0] : null,
      libelle: (modele.libelle || libelleParDefaut(op)).slice(0, 200),
      fournisseur: modele.fournisseur || "Divers",
      montant_cents: op.montant_cents,
      date_operation: op.date_operation,
      statut: "a_verifier",
      source: "manuel",
      compte: op.compte,
      school_year: exerciceDeLaDate(op.date_operation),
      note: mode === "auto" ? "Créée automatiquement : classée comme la fois précédente." : null,
      created_by: parentId,
    })
    .select("*")
    .single();
  if (error) return { error: error.message };

  const annuler = async () => {
    await admin.from("compta_operation_lignes").delete().eq("ligne_id", ligne.id);
    await admin.from("compta_lignes").delete().eq("id", ligne.id);
  };
  if (modele.rubrique === "evenement" && modele.evenements.length) {
    const { error: eEv } = await admin
      .from("compta_ligne_evenements")
      .insert(modele.evenements.map((evenement_id) => ({ ligne_id: ligne.id, evenement_id })));
    if (eEv) {
      await annuler();
      return { error: eEv.message };
    }
  }
  if (modele.rubrique === "classe" && modele.classes.length) {
    const { error: eCl } = await admin
      .from("compta_ligne_classes")
      .insert(modele.classes.map((class_label) => ({ ligne_id: ligne.id, class_label })));
    if (eCl) {
      await annuler();
      return { error: eCl.message };
    }
  }
  const r = await appliquerPointage(admin, op, ligne, parentId, mode);
  if (r.error) {
    await annuler();
    return r;
  }
  return { ok: true, ligneId: ligne.id };
}

// Pointage automatique de toutes les opérations « à pointer » sans aucune
// ligne déjà liée. Renvoie le nombre de rapprochements faits.
export async function pointerAutomatiquement(admin, parentId) {
  const { data: ops } = await admin
    .from("compta_operations")
    .select("*")
    .eq("statut", "a_pointer")
    .order("date_operation", { ascending: true });
  if (!ops || ops.length === 0) return { pointees: 0 };

  const liens = await chargerLiens(admin);
  if (liens.absente) return { pointees: 0, migrationManquante: true };
  // Une opération rouverte à la main (note « reouverte ») n'est plus traitée
  // automatiquement : le bureau a voulu la refaire lui-même.
  const aTraiter = ops.filter((o) => !(liens.parOperation[o.id] || []).length && o.note !== "reouverte");

  const { data: lignes } = await admin
    .from("compta_lignes")
    .select("*")
    .in("statut", ["a_verifier", "prevu", "a_valider"]);
  const libres = (lignes || []).filter((l) => !liens.prises.has(l.id));

  const idsParents = [...new Set(libres.map((l) => l.paye_par_parent_id).filter(Boolean))];
  const noms = {};
  if (idsParents.length) {
    const { data: ps } = await admin.from("parents").select("id, first_name, last_name").in("id", idsParents);
    for (const p of ps || []) noms[p.id] = `${p.first_name || ""} ${p.last_name || ""}`;
  }

  // 1re passe : le choix automatique de chaque opération.
  const envies = [];
  for (const op of aTraiter) {
    const choix = candidatAutomatique(candidatsPourOperation(op, libres, noms));
    if (choix) envies.push({ op, choix });
  }

  // Une même ligne convoitée par plusieurs opérations (un abonnement mensuel
  // de même montant, par exemple) va à la plus proche ; en cas d'égalité, à
  // personne : le bureau tranche.
  const parLigne = {};
  for (const e of envies) (parLigne[e.choix.ligne.id] ||= []).push(e);
  let pointees = 0;
  const dejaTraitees = new Set();
  for (const groupe of Object.values(parLigne)) {
    groupe.sort((x, y) => y.choix.score - x.choix.score);
    if (groupe.length > 1 && groupe[0].choix.score === groupe[1].choix.score) continue;
    const { op, choix } = groupe[0];
    const r = await appliquerPointage(admin, op, choix.ligne, parentId, "auto");
    if (r.ok) {
      pointees++;
      dejaTraitees.add(op.id);
    }
  }

  // 2e passe : ce qui reste et qui revient régulièrement (frais bancaires,
  // prélèvements…) est classé comme la fois précédente.
  let apprises = 0;
  const modeles = await chargerModeles(admin);
  for (const op of aTraiter) {
    if (dejaTraitees.has(op.id) || !estOperationAutomatique(op)) continue;
    const sig = signatureOperation(op);
    const modele = sig ? modeles.get(sig) : null;
    if (!modele) continue;
    const r = await appliquerModele(admin, op, modele, parentId, "auto");
    if (r.ok) apprises++;
  }
  return { pointees, apprises };
}
