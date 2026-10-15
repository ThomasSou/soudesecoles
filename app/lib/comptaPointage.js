import { normaliser, moyenDepuisType } from "./releveCA";

// Rapprochement entre les opérations du relevé bancaire (`compta_operations`)
// et les lignes de comptabilité saisies (`compta_lignes`).
//
// Principe : une opération n'est rapprochée AUTOMATIQUEMENT que lorsque la
// concordance est sûre (même sens, même montant à l'euro près ET un seul
// candidat crédible). Dans tous les autres cas, les candidats sont proposés
// au bureau, qui tranche. Mieux vaut un pointage manuel de trop qu'un pointage
// automatique faux qui fausse les comptes en silence.

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

// Candidats pour une opération : lignes de même sens et de même montant, avec
// un score et les raisons affichées au bureau.
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

const COLONNES_PAIEMENT = ["paiement_statut", "moyen_paiement", "paiement_le"];

// Applique le pointage d'une opération sur une ligne, des deux côtés.
export async function appliquerPointage(admin, op, ligne, parentId, mode) {
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
  if (error) return { error: error.message };

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

  const { error: eOp } = await admin
    .from("compta_operations")
    .update({
      statut: "pointee",
      ligne_id: ligne.id,
      mode_pointage: mode,
      pointee_le: maintenant,
      pointee_par: parentId,
    })
    .eq("id", op.id);
  if (eOp) return { error: eOp.message };
  return { ok: true };
}

// Pointage automatique de toutes les opérations « à pointer » (ou d'une
// liste). Renvoie le nombre de rapprochements faits.
export async function pointerAutomatiquement(admin, parentId) {
  const { data: ops } = await admin
    .from("compta_operations")
    .select("*")
    .eq("statut", "a_pointer")
    .order("date_operation", { ascending: true });
  if (!ops || ops.length === 0) return { pointees: 0 };

  const [{ data: lignes }, { data: dejaLiees }] = await Promise.all([
    admin
      .from("compta_lignes")
      .select("*")
      .in("statut", ["a_verifier", "prevu", "a_valider"]),
    admin.from("compta_operations").select("ligne_id").not("ligne_id", "is", null),
  ]);
  const prises = new Set((dejaLiees || []).map((o) => o.ligne_id));
  const libres = (lignes || []).filter((l) => !prises.has(l.id));

  const idsParents = [...new Set(libres.map((l) => l.paye_par_parent_id).filter(Boolean))];
  const noms = {};
  if (idsParents.length) {
    const { data: ps } = await admin.from("parents").select("id, first_name, last_name").in("id", idsParents);
    for (const p of ps || []) noms[p.id] = `${p.first_name || ""} ${p.last_name || ""}`;
  }

  // 1re passe : le choix automatique de chaque opération.
  const envies = [];
  for (const op of ops) {
    const choix = candidatAutomatique(candidatsPourOperation(op, libres, noms));
    if (choix) envies.push({ op, choix });
  }

  // Une même ligne convoitée par plusieurs opérations (un abonnement mensuel
  // de même montant, par exemple) va à la plus proche ; en cas d'égalité, à
  // personne : le bureau tranche.
  const parLigne = {};
  for (const e of envies) (parLigne[e.choix.ligne.id] ||= []).push(e);
  let pointees = 0;
  for (const groupe of Object.values(parLigne)) {
    groupe.sort((x, y) => y.choix.score - x.choix.score);
    if (groupe.length > 1 && groupe[0].choix.score === groupe[1].choix.score) continue;
    const { op, choix } = groupe[0];
    const r = await appliquerPointage(admin, op, choix.ligne, parentId, "auto");
    if (r.ok) pointees++;
  }
  return { pointees };
}
