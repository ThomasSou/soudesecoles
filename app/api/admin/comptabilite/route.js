import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import { currentSchoolYear } from "../../../lib/anneeScolaire";
import { televerserJustificatif, TYPES_JUSTIFICATIF } from "../../../lib/comptaFichiers";
import { CLASSES_REFERENCE, CLES_CLASSES, libelleClasse } from "../../../lib/classesReference";
import { repartirEgal, resoudreRepartition } from "../../../lib/comptaRepartition";

export const dynamic = "force-dynamic";

const RUBRIQUES = ["evenement", "investissement", "courant", "classe"];
const STATUTS = ["prevu", "a_verifier", "pointe"];
const SENS = ["depense", "recette"];
const COMPTES = ["courant", "placement"];

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

export async function GET(request) {
  const auth = await requirePermission(request, "comptabilite");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = new URL(request.url).searchParams;
  const annee = params.get("annee") || currentSchoolYear();

  await synchroniserFacturesEnseignants(auth.admin, annee);

  let requete = auth.admin
    .from("compta_lignes")
    .select(
      "id, sens, rubrique, evenement_id, libelle, fournisseur, montant_cents, date_operation, statut, source, teacher_invoice_id, compte, ref_bancaire, note, justificatif_path, justificatif_type, school_year, pointe_le, created_at"
    )
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
    // facture enseignant — celui de la fiche enseignant (facture définitive).
    a_justificatif: Boolean(l.justificatif_path || l.teacher_invoice_id),
    a_justificatif_propre: Boolean(l.justificatif_path),
    justificatif_type: l.justificatif_path
      ? l.justificatif_type || null
      : l.teacher_invoice_id
        ? "facture_definitive"
        : null,
    justificatif_path: undefined,
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
      const cible = l.statut === "prevu" ? bucket.previsionnel : bucket.realise;
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
      const cible = l.statut === "prevu" ? bucket.previsionnel : bucket.realise;
      cible[l.sens === "depense" ? "depense_cents" : "recette_cents"] += parts[i];
    });
  }

  // Données de référence pour les filtres et le formulaire.
  const [evenementsRes, anneesLignesRes, anneesFacturesRes] = await Promise.all([
    auth.admin.from("benevolat_evenements").select("id, nom").order("created_at", { ascending: false }),
    auth.admin.from("compta_lignes").select("school_year"),
    auth.admin.from("teacher_invoices").select("school_year"),
  ]);
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
      parClasse: Object.fromEntries(
        Object.entries(parClasse).map(([cle, v]) => [cle, { ...v, libelle: libelleClasse(cle) }])
      ),
      parEvenement: Object.fromEntries(
        Object.entries(parEvenement).map(([id, v]) => [id, { ...v, nom: evenementNom[id] || "Manifestation" }])
      ),
    },
    evenements: evenementsRes.data || [],
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
  if (!Number.isFinite(montant) || montant <= 0) {
    return NextResponse.json({ error: "Le montant doit être supérieur à 0." }, { status: 400 });
  }
  if (!STATUTS.includes(statut)) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
  }
  if (compte && !COMPTES.includes(compte)) {
    return NextResponse.json({ error: "Compte bancaire invalide." }, { status: 400 });
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

  const { data: ligne, error } = await auth.admin
    .from("compta_lignes")
    .insert({
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
    })
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
