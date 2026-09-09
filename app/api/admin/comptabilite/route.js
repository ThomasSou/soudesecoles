import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import { currentSchoolYear } from "../../../lib/anneeScolaire";
import { televerserJustificatif, TYPES_JUSTIFICATIF } from "../../../lib/comptaFichiers";
import { CLASSES_REFERENCE, CLES_CLASSES, libelleClasse } from "../../../lib/classesReference";
import { repartirEgal, resoudreRepartition } from "../../../lib/comptaRepartition";

export const dynamic = "force-dynamic";

const RUBRIQUES = ["evenement", "investissement", "courant", "classe"];
const STATUTS = ["prevu", "a_verifier", "pointe", "a_valider"];
const SENS = ["depense", "recette"];
const COMPTES = ["courant", "placement"];
const MOYENS_PAIEMENT = ["virement", "cheque", "cb", "especes", "prelevement", "autre"];

// Recopie en lignes de compta les factures des enseignants de l'année qui
// n'y sont pas encore (source = 'enseignant'). Idempotent grâce à l'index
// unique sur teacher_invoice_id. Pas de trigger SQL : cohérent avec le reste
// du projet (les migrations sont lancées à la main).
async function synchroniserFacturesEnseignants(admin, annee) {
  const { data: factures } = await admin
    .from("teacher_invoices")
    .select("id, label, supplier_name, amount_cents, school_year, reimbursed_at")
    .eq("school_year", annee);

  if (!factures || factures.length === 0) return;

  const { data: dejaLa } = await admin
    .from("compta_lignes")
    .select("teacher_invoice_id")
    .not("teacher_invoice_id", "is", null)
    .eq("school_year", annee);

  const connues = new Set((dejaLa || []).map((l) => l.teacher_invoice_id));
  const aCreer = factures.filter((f) => !connues.has(f.id));
  if (aCreer.length === 0) return;

  const { data: lignesCreees } = await admin
    .from("compta_lignes")
    .insert(
      aCreer.map((f) => ({
        sens: "depense",
        rubrique: "classe",
        libelle: f.label,
        fournisseur: f.supplier_name,
        montant_cents: f.amount_cents,
        date_operation: f.reimbursed_at ? f.reimbursed_at.slice(0, 10) : null,
        statut: "a_verifier",
        source: "enseignant",
        teacher_invoice_id: f.id,
        school_year: annee,
      }))
    )
    .select("id, teacher_invoice_id");

  if (!lignesCreees || lignesCreees.length === 0) return;

  const invoiceIds = lignesCreees.map((l) => l.teacher_invoice_id);
  const { data: liensClasses } = await admin
    .from("teacher_invoice_classes")
    .select("invoice_id, class_label")
    .in("invoice_id", invoiceIds);

  const ligneParFacture = Object.fromEntries(
    lignesCreees.map((l) => [l.teacher_invoice_id, l.id])
  );
  const aInserer = (liensClasses || [])
    .map((c) => ({ ligne_id: ligneParFacture[c.invoice_id], class_label: c.class_label }))
    .filter((c) => c.ligne_id);

  if (aInserer.length > 0) {
    await admin.from("compta_ligne_classes").insert(aInserer);
  }
}

// Rubrique de compta pour une catégorie de demande de remboursement.
const RUBRIQUE_PAR_CATEGORIE = {
  manifestation: "evenement",
  investissement: "investissement",
  fonctionnement: "courant",
  autre: "courant",
};

// Recopie en lignes de compta les demandes de remboursement des bénévoles
// (source = 'benevole', payé par le bénévole). Statut d'entrée : 'a_valider'
// (le bureau valide, puis rembourse, puis pointe). Idempotent via l'index
// unique sur reimbursement_request_id.
async function synchroniserRemboursementsBenevoles(admin, annee) {
  const { data: demandes } = await admin
    .from("reimbursement_requests")
    .select(
      "id, parent_id, category, evenement_id, event_name, description, supplier_name, amount_cents, status, created_at"
    )
    .neq("status", "refused");

  if (!demandes || demandes.length === 0) return;

  // Périmètre : demandes rattachées à l'année scolaire demandée (déduite de
  // la date de dépôt).
  const delAnnee = demandes.filter((d) => currentSchoolYear(new Date(d.created_at)) === annee);
  if (delAnnee.length === 0) return;

  const { data: dejaLa } = await admin
    .from("compta_lignes")
    .select("reimbursement_request_id")
    .not("reimbursement_request_id", "is", null);
  const connues = new Set((dejaLa || []).map((l) => l.reimbursement_request_id));

  const aCreer = delAnnee.filter((d) => !connues.has(d.id));
  if (aCreer.length === 0) return;

  const lignes = aCreer.map((d) => {
    let rubrique = RUBRIQUE_PAR_CATEGORIE[d.category] || "courant";
    // Rubrique « evenement » exige un evenement_id : sinon on retombe sur
    // « courant ».
    if (rubrique === "evenement" && !d.evenement_id) rubrique = "courant";
    return {
      sens: "depense",
      rubrique,
      evenement_id: rubrique === "evenement" ? d.evenement_id : null,
      libelle: d.description?.trim() || d.supplier_name || "Frais avancés par un bénévole",
      fournisseur: d.supplier_name || null,
      montant_cents: d.amount_cents,
      statut: d.status === "reimbursed" ? "a_verifier" : "a_valider",
      source: "benevole",
      paye_par: "benevole",
      paye_par_parent_id: d.parent_id,
      reimbursement_request_id: d.id,
      school_year: annee,
    };
  });

  const { data: creees } = await admin
    .from("compta_lignes")
    .insert(lignes)
    .select("id, reimbursement_request_id, rubrique, evenement_id");
  if (!creees || creees.length === 0) return;

  const liensEvt = creees
    .filter((l) => l.rubrique === "evenement" && l.evenement_id)
    .map((l) => ({ ligne_id: l.id, evenement_id: l.evenement_id }));
  if (liensEvt.length > 0) {
    await admin.from("compta_ligne_evenements").insert(liensEvt);
  }
}

export async function GET(request) {
  const auth = await requirePermission(request, "comptabilite");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = new URL(request.url).searchParams;
  const annee = params.get("annee") || currentSchoolYear();

  await synchroniserFacturesEnseignants(auth.admin, annee);
  await synchroniserRemboursementsBenevoles(auth.admin, annee);

  // select("*") plutôt qu'une liste figée : la page continue de fonctionner
  // même si une migration ajoutant une colonne n'a pas encore été lancée.
  let requete = auth.admin
    .from("compta_lignes")
    .select("*")
    .eq("school_year", annee)
    .order("date_operation", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  const fSens = params.get("sens");
  const fRubrique = params.get("rubrique");
  const fStatut = params.get("statut");
  const fEvenement = params.get("evenementId");
  if (fSens && SENS.includes(fSens)) requete = requete.eq("sens", fSens);
  if (fRubrique && RUBRIQUES.includes(fRubrique)) requete = requete.eq("rubrique", fRubrique);
  if (fStatut && STATUTS.includes(fStatut)) requete = requete.eq("statut", fStatut);

  const { data: lignesBrutes, error } = await requete;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (lignesBrutes || []).map((l) => l.id);
  const [liensClassesRes, liensEvenementsRes] = await Promise.all([
    ids.length
      ? auth.admin.from("compta_ligne_classes").select("*").in("ligne_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? auth.admin.from("compta_ligne_evenements").select("*").in("ligne_id", ids)
      : Promise.resolve({ data: [] }),
  ]);
  const liensClasses = liensClassesRes.data;
  const classesParLigne = {};
  const montantsClasseParLigne = {};
  for (const l of liensClasses || []) {
    (classesParLigne[l.ligne_id] ||= []).push(l.class_label);
    if (l.montant_cents != null) {
      (montantsClasseParLigne[l.ligne_id] ||= {})[l.class_label] = l.montant_cents;
    }
  }
  const evenementsParLigne = {};
  const montantsEvtParLigne = {};
  for (const l of liensEvenementsRes.data || []) {
    (evenementsParLigne[l.ligne_id] ||= []).push(l.evenement_id);
    if (l.montant_cents != null) {
      (montantsEvtParLigne[l.ligne_id] ||= {})[l.evenement_id] = l.montant_cents;
    }
  }

  // Statut de la demande de remboursement liée (pour les lignes bénévoles).
  const demandeIds = [
    ...new Set((lignesBrutes || []).map((l) => l.reimbursement_request_id).filter(Boolean)),
  ];
  const { data: demandesLiees } = demandeIds.length
    ? await auth.admin
        .from("reimbursement_requests")
        .select("id, status, processed_at")
        .in("id", demandeIds)
    : { data: [] };
  const demandeParId = Object.fromEntries((demandesLiees || []).map((d) => [d.id, d]));

  let lignes = (lignesBrutes || []).map((l) => ({
    ...l,
    classes: (classesParLigne[l.id] || []).sort((a, b) => a.localeCompare(b, "fr")),
    classesMontants: montantsClasseParLigne[l.id] || {},
    repartitionClasses: montantsClasseParLigne[l.id] ? "differenciee" : "egale",
    // Manifestations de la ligne : la table de liaison, avec repli sur la
    // colonne mono-événement tant que la reprise 0043 n'est pas passée.
    evenements:
      evenementsParLigne[l.id] || (l.evenement_id ? [l.evenement_id] : []),
    evenementsMontants: montantsEvtParLigne[l.id] || {},
    repartitionEvenements: montantsEvtParLigne[l.id] ? "differenciee" : "egale",
    // Justificatif : fichier propre à la ligne (avec sa nature devis /
    // facture provisoire / définitive), ou — pour une ligne recopiée d'une
    // facture enseignant ou d'une demande bénévole — le fichier de celle-ci.
    a_justificatif: Boolean(
      l.justificatif_path || l.teacher_invoice_id || l.reimbursement_request_id
    ),
    a_justificatif_propre: Boolean(l.justificatif_path),
    justificatif_type: l.justificatif_path
      ? l.justificatif_type || null
      : l.teacher_invoice_id || l.reimbursement_request_id
        ? "facture_definitive"
        : null,
    justificatif_path: undefined,
    // Suivi du remboursement — pour toute ligne avancée par un bénévole
    // (saisie bureau OU demande côté famille). rembourse_le sur la ligne
    // fait foi ; à défaut, le statut de la demande liée.
    rembourse: Boolean(
      l.rembourse_le ||
        (l.reimbursement_request_id &&
          demandeParId[l.reimbursement_request_id]?.status === "reimbursed")
    ),
    rembourse_le:
      l.rembourse_le ||
      (l.reimbursement_request_id
        ? demandeParId[l.reimbursement_request_id]?.processed_at || null
        : null),
    // État de paiement — ne concerne que les dépenses saisies à la main et
    // réglées par le Sou. Les avances bénévoles ont leur propre suivi
    // (rembourse_le) ; les factures enseignant sont pilotées depuis leur
    // fiche. Défaut « à payer » déduit ici : la colonne n'est écrite que
    // quand le bureau renseigne le paiement (compat avant migration 0049).
    paiement_concerne:
      l.sens === "depense" && l.source === "manuel" && (l.paye_par || "sou") !== "benevole",
    paiement_statut:
      l.sens === "depense" && l.source === "manuel" && (l.paye_par || "sou") !== "benevole"
        ? l.paiement_statut || "a_payer"
        : null,
    moyen_paiement: l.moyen_paiement || null,
    paiement_le: l.paiement_le || null,
  }));

  // Filtres portant sur les tables de liaison : appliqués ici.
  const fClasse = params.get("classe");
  if (fClasse) {
    lignes = lignes.filter((l) => l.classes.includes(fClasse));
  }
  if (fEvenement) {
    lignes = lignes.filter((l) => l.evenements.includes(fEvenement));
  }

  // Totaux.
  const vide = () => ({ depense_cents: 0, recette_cents: 0 });
  const ajoute = (acc, l) => {
    acc[l.sens === "depense" ? "depense_cents" : "recette_cents"] += l.montant_cents;
    return acc;
  };
  // Une ligne « prévisionnelle » (statut prevu — typiquement un devis non
  // validé) est comptée à part du réalisé, jamais mélangée.
  const videSplit = () => ({ realise: vide(), previsionnel: vide() });

  const totalGlobal = lignes.reduce((a, l) => ajoute(a, l), vide());
  const parStatut = {};
  const parRubrique = {};
  for (const l of lignes) {
    (parStatut[l.statut] ||= vide()) && ajoute(parStatut[l.statut], l);
    (parRubrique[l.rubrique] ||= vide()) && ajoute(parRubrique[l.rubrique], l);
  }

  // Parts d'une ligne entre ses classes / manifestations : montants saisis
  // si répartition différenciée, sinon division à parts égales.
  const partsLigne = (l, cibles, montants) =>
    montants && Object.keys(montants).length
      ? cibles.map((c) => montants[c] || 0)
      : repartirEgal(l.montant_cents, cibles.length);

  // Récap par classe. Réalisé / prévisionnel séparés.
  const parClasse = {};
  for (const l of lignes) {
    if (l.rubrique !== "classe" || l.classes.length === 0) continue;
    const parts = partsLigne(l, l.classes, l.classesMontants);
    l.classes.forEach((c, i) => {
      const bucket = (parClasse[c] ||= videSplit());
      const prev = l.statut === "prevu" || l.statut === "a_valider";
      const cible = prev ? bucket.previsionnel : bucket.realise;
      cible[l.sens === "depense" ? "depense_cents" : "recette_cents"] += parts[i];
    });
  }

  // Récap par manifestation. Réalisé / prévisionnel séparés.
  const parEvenement = {};
  for (const l of lignes) {
    if (l.rubrique !== "evenement" || l.evenements.length === 0) continue;
    const parts = partsLigne(l, l.evenements, l.evenementsMontants);
    l.evenements.forEach((evId, i) => {
      const bucket = (parEvenement[evId] ||= videSplit());
      const prev = l.statut === "prevu" || l.statut === "a_valider";
      const cible = prev ? bucket.previsionnel : bucket.realise;
      cible[l.sens === "depense" ? "depense_cents" : "recette_cents"] += parts[i];
    });
  }

  // À rembourser aux bénévoles : total non remboursé par personne.
  const parBenevole = {};
  for (const l of lignes) {
    if (l.paye_par !== "benevole" || l.rembourse || !l.paye_par_parent_id) continue;
    parBenevole[l.paye_par_parent_id] =
      (parBenevole[l.paye_par_parent_id] || 0) + l.montant_cents;
  }

  // À payer : dépenses saisies à la main, réglées par le Sou, pas encore
  // soldées. Même logique que la ligne « À pointer / Pointé ».
  let aPayerCents = 0;
  for (const l of lignes) {
    if (l.paiement_concerne && l.paiement_statut === "a_payer") aPayerCents += l.montant_cents;
  }

  // Données de référence pour les filtres et le formulaire.
  const [
    evenementsRes,
    anneesLignesRes,
    anneesFacturesRes,
    parentsRes,
    fournLignesRes,
    fournFacturesRes,
    fournDemandesRes,
  ] = await Promise.all([
    auth.admin.from("benevolat_evenements").select("id, nom").order("created_at", { ascending: false }),
    auth.admin.from("compta_lignes").select("school_year"),
    auth.admin.from("teacher_invoices").select("school_year"),
    auth.admin.from("parents").select("id, first_name, last_name").order("last_name"),
    auth.admin.from("compta_lignes").select("fournisseur").not("fournisseur", "is", null),
    auth.admin.from("teacher_invoices").select("supplier_name").not("supplier_name", "is", null),
    auth.admin
      .from("reimbursement_requests")
      .select("supplier_name")
      .not("supplier_name", "is", null),
  ]);

  // Fournisseurs déjà saisis (toutes sources confondues), dédoublonnés à la
  // casse près : sert de liste de suggestions pour toujours écrire un même
  // fournisseur de la même manière.
  const fournMap = new Map();
  for (const v of [
    ...(fournLignesRes.data || []).map((x) => x.fournisseur),
    ...(fournFacturesRes.data || []).map((x) => x.supplier_name),
    ...(fournDemandesRes.data || []).map((x) => x.supplier_name),
  ]) {
    const nom = (v || "").trim();
    if (nom && !fournMap.has(nom.toLowerCase())) fournMap.set(nom.toLowerCase(), nom);
  }
  const fournisseurs = [...fournMap.values()].sort((a, b) => a.localeCompare(b, "fr"));
  const parents = (parentsRes.data || []).map((p) => ({
    id: p.id,
    nom: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Sans nom",
  }));
  const anneesSet = new Set([annee, currentSchoolYear()]);
  for (const r of [...(anneesLignesRes.data || []), ...(anneesFacturesRes.data || [])]) {
    if (r.school_year) anneesSet.add(r.school_year);
  }

  // Classes : la référence figée (avec enseignant·e), plus tout libellé déjà
  // présent en base qui n'en fait pas partie (ex. hérité d'une facture
  // enseignant) — pour que le filtre et les récaps restent complets.
  const clesConnues = new Set(CLES_CLASSES);
  const classesEnPlus = [
    ...new Set((liensClasses || []).map((l) => l.class_label).filter((c) => !clesConnues.has(c))),
  ].sort((a, b) => a.localeCompare(b, "fr"));
  const evenementNom = Object.fromEntries((evenementsRes.data || []).map((e) => [e.id, e.nom]));

  return NextResponse.json({
    ok: true,
    annee,
    annees: [...anneesSet].sort().reverse(),
    lignes,
    totaux: {
      global: totalGlobal,
      parStatut,
      parRubrique,
      aPayer: { montant_cents: aPayerCents },
      parClasse: Object.fromEntries(
        Object.entries(parClasse).map(([cle, v]) => [cle, { ...v, libelle: libelleClasse(cle) }])
      ),
      parEvenement: Object.fromEntries(
        Object.entries(parEvenement).map(([id, v]) => [id, { ...v, nom: evenementNom[id] || "Manifestation" }])
      ),
      parBenevole: Object.fromEntries(
        Object.entries(parBenevole).map(([id, cents]) => [
          id,
          { nom: parents.find((p) => p.id === id)?.nom || "Bénévole", montant_cents: cents },
        ])
      ),
    },
    evenements: evenementsRes.data || [],
    parents,
    fournisseurs,
    classesRef: CLASSES_REFERENCE.map((c) => ({
      cle: c.cle,
      groupe: c.groupe,
      libelle: libelleClasse(c.cle),
    })),
    classesEnPlus,
  });
}

// Saisie manuelle d'une ligne.
export async function POST(request) {
  const auth = await requirePermission(request, "comptabilite");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const sens = body?.sens;
  const rubrique = body?.rubrique;
  const libelle = body?.libelle?.trim();
  const fournisseur = body?.fournisseur?.trim() || null;
  const montant = Number(String(body?.montant ?? "").replace(",", "."));
  const dateOperation = body?.dateOperation || null;
  const compte = body?.compte || null;
  const statut = body?.statut || "a_verifier";
  const note = body?.note?.trim() || null;
  // Manifestations : liste (répartition à parts égales). Compat : accepte
  // encore `evenementId` seul.
  const evenements = Array.isArray(body?.evenements)
    ? [...new Set(body.evenements.map((e) => String(e).trim()).filter(Boolean))]
    : body?.evenementId
      ? [String(body.evenementId).trim()]
      : [];
  const classes = Array.isArray(body?.classes)
    ? [...new Set(body.classes.map((c) => String(c).trim()).filter((c) => CLES_CLASSES.includes(c)))]
    : [];
  const annee = body?.annee || currentSchoolYear();
  const payePar = body?.payePar === "benevole" ? "benevole" : "sou";
  const payeParParentId = payePar === "benevole" ? body?.payeParParentId || null : null;

  // État de paiement — uniquement pour une dépense réglée par le Sou. On ne
  // renseigne la colonne que si la facture est marquée « payée » : une
  // dépense « à payer » reste la valeur par défaut, déduite à l'affichage,
  // ce qui garde la saisie possible avant la migration 0049.
  const concernePaiement = sens === "depense" && payePar === "sou";
  const paiementPaye = concernePaiement && body?.paiementStatut === "paye";
  const moyenPaiement = MOYENS_PAIEMENT.includes(body?.moyenPaiement) ? body.moyenPaiement : null;
  const paiementLe = body?.paiementLe || null;

  // Un devis (non validé) est une dépense prévisionnelle : la ligne est
  // forcée en statut « prevu », quel que soit le statut demandé.
  const estDevis = body?.justificatifDataUrl && body?.justificatifType === "devis";
  const statutEffectif = estDevis ? "prevu" : statut;

  if (!SENS.includes(sens)) {
    return NextResponse.json({ error: "Sens invalide (dépense ou recette)." }, { status: 400 });
  }
  if (!RUBRIQUES.includes(rubrique)) {
    return NextResponse.json({ error: "Choisissez une rubrique." }, { status: 400 });
  }
  if (!libelle) {
    return NextResponse.json({ error: "Donnez un libellé à la ligne." }, { status: 400 });
  }
  if (!fournisseur) {
    return NextResponse.json(
      { error: "Le fournisseur est obligatoire (il sert aussi à repérer les doublons)." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(montant) || montant <= 0) {
    return NextResponse.json({ error: "Le montant doit être supérieur à 0." }, { status: 400 });
  }
  if (!STATUTS.includes(statut)) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
  }
  // Date obligatoire dès que la ligne n'est pas prévisionnelle (un devis, lui,
  // n'a pas encore de date d'opération).
  if (statutEffectif !== "prevu" && !dateOperation) {
    return NextResponse.json(
      { error: "La date de l'opération est obligatoire (sauf pour une ligne prévisionnelle)." },
      { status: 400 }
    );
  }
  if (compte && !COMPTES.includes(compte)) {
    return NextResponse.json({ error: "Compte bancaire invalide." }, { status: 400 });
  }
  if (payePar === "benevole" && !payeParParentId) {
    return NextResponse.json(
      { error: "Choisissez le bénévole qui a avancé la dépense." },
      { status: 400 }
    );
  }
  if (paiementPaye && !moyenPaiement) {
    return NextResponse.json(
      { error: "Indiquez le moyen de paiement (virement, chèque…)." },
      { status: 400 }
    );
  }
  if (rubrique === "evenement" && evenements.length === 0) {
    return NextResponse.json(
      { error: "Choisissez au moins une manifestation." },
      { status: 400 }
    );
  }
  if (rubrique === "classe" && classes.length === 0) {
    return NextResponse.json(
      { error: "Choisissez au moins une classe dans la liste." },
      { status: 400 }
    );
  }

  // Répartition (égale par défaut, ou différenciée avec un montant par
  // classe / manifestation dont la somme doit égaler le total de la ligne).
  const montantCentsTotal = Math.round(montant * 100);
  let montantsClasses = {};
  let montantsEvenements = {};
  if (rubrique === "classe") {
    const r = resoudreRepartition({
      cles: classes,
      mode: body?.repartitionClasses,
      montantsBruts: body?.classesMontants,
      totalCents: montantCentsTotal,
      libelle: libelleClasse,
    });
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    montantsClasses = r.montants;
  }
  if (rubrique === "evenement") {
    const r = resoudreRepartition({
      cles: evenements,
      mode: body?.repartitionEvenements,
      montantsBruts: body?.evenementsMontants,
      totalCents: montantCentsTotal,
    });
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    montantsEvenements = r.montants;
  }

  // Détection de doublon : même fournisseur (à la casse près), même montant
  // et même sens sur l'année scolaire. On bloque avec un 409 « à confirmer »,
  // que le formulaire peut forcer (ignorerDoublon) après validation humaine.
  if (!body?.ignorerDoublon) {
    const { data: memeMontant } = await auth.admin
      .from("compta_lignes")
      .select("id, libelle, date_operation, statut, fournisseur")
      .eq("school_year", annee)
      .eq("sens", sens)
      .eq("montant_cents", montantCentsTotal);
    const cible = fournisseur.trim().toLowerCase();
    const similaires = (memeMontant || []).filter(
      (l) => (l.fournisseur || "").trim().toLowerCase() === cible
    );
    if (similaires.length > 0) {
      return NextResponse.json(
        {
          doublonPossible: true,
          message: `Attention : ${similaires.length} ligne(s) existe(nt) déjà avec « ${fournisseur} » au même montant (${(montantCentsTotal / 100).toFixed(2)} €) cette année.`,
          lignesSimilaires: similaires.map((l) => ({
            libelle: l.libelle,
            date_operation: l.date_operation,
            statut: l.statut,
          })),
        },
        { status: 409 }
      );
    }
  }

  const nouvelleLigne = {
    sens,
    rubrique,
    // Colonne conservée : porte la 1re manifestation (contrainte de
    // cohérence). La liste complète est dans compta_ligne_evenements.
    evenement_id: rubrique === "evenement" ? evenements[0] : null,
    libelle,
    fournisseur,
    montant_cents: Math.round(montant * 100),
    date_operation: dateOperation,
    statut: statutEffectif,
    source: "manuel",
    compte,
    pointe_le: statutEffectif === "pointe" ? new Date().toISOString() : null,
    pointe_par: statutEffectif === "pointe" ? auth.parent.id : null,
    note,
    school_year: annee,
    created_by: auth.parent.id,
  };
  // paye_par ajouté seulement quand ce n'est pas « le Sou » : une saisie
  // normale reste possible même si la migration 0046 n'est pas passée.
  if (payePar === "benevole") {
    nouvelleLigne.paye_par = "benevole";
    nouvelleLigne.paye_par_parent_id = payeParParentId;
  }
  // Idem : on n'écrit paiement_* que si la facture est marquée « payée »
  // (compat avant migration 0049).
  if (paiementPaye) {
    nouvelleLigne.paiement_statut = "paye";
    nouvelleLigne.moyen_paiement = moyenPaiement;
    if (paiementLe) nouvelleLigne.paiement_le = paiementLe;
  }

  const { data: ligne, error } = await auth.admin
    .from("compta_lignes")
    .insert(nouvelleLigne)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Le champ montant_cents n'est ajouté qu'en répartition différenciée : les
  // lignes égales restent insérables même si la migration 0044 n'est pas
  // encore passée.
  const lienAvecMontant = (base, montants, cle) => {
    const row = { ...base };
    if (montants[cle] != null) row.montant_cents = montants[cle];
    return row;
  };

  if (rubrique === "classe" && classes.length > 0) {
    const { error: eClasses } = await auth.admin
      .from("compta_ligne_classes")
      .insert(
        classes.map((class_label) =>
          lienAvecMontant({ ligne_id: ligne.id, class_label }, montantsClasses, class_label)
        )
      );
    if (eClasses) return NextResponse.json({ error: eClasses.message }, { status: 500 });
  }

  if (rubrique === "evenement" && evenements.length > 0) {
    const { error: eEv } = await auth.admin
      .from("compta_ligne_evenements")
      .insert(
        evenements.map((evenement_id) =>
          lienAvecMontant({ ligne_id: ligne.id, evenement_id }, montantsEvenements, evenement_id)
        )
      );
    if (eEv) return NextResponse.json({ error: eEv.message }, { status: 500 });
  }

  // Justificatif (devis ou facture, PDF ou image) joint à la création.
  if (body?.justificatifDataUrl) {
    const type = TYPES_JUSTIFICATIF.includes(body?.justificatifType)
      ? body.justificatifType
      : "facture_definitive";
    const { path, error: eFichier } = await televerserJustificatif(
      auth.admin,
      ligne.id,
      body.justificatifDataUrl
    );
    if (eFichier) return NextResponse.json({ error: eFichier }, { status: 400 });
    await auth.admin
      .from("compta_lignes")
      .update({ justificatif_path: path, justificatif_type: type })
      .eq("id", ligne.id);
  }

  return NextResponse.json({ ok: true, id: ligne.id });
}
