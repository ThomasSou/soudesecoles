import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { currentSchoolYear } from "../../../../lib/anneeScolaire";
import { comparerClasses } from "../../../../lib/classes";
import { repartirEgal } from "../../../../lib/comptaRepartition";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Tableau de bord « Enseignants » (décision D11).
//   - total engagé sur l'année (devis validés + factures)
//   - détail par statut
//   - récap PAR CLASSE : combien le Sou a financé pour chaque classe
//
// Attribution par classe : le montant d'un devis / d'une facture est RÉPARTI
// à parts égales entre les classes qu'il concerne (un devis de 500 € pour 2
// classes = 250 € chacune ; le reste en centimes va aux premières classes).
// La somme des classes redonne donc exactement le total réel.
//
// Filtre : ?annee=YYYY-YYYY (année scolaire en cours par défaut).
export async function GET(request) {
  const auth = await requirePermission(request, "enseignants");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const annee = new URL(request.url).searchParams.get("annee") || currentSchoolYear();

  const [quotesRes, invoicesRes, anneesQuotesRes, anneesInvoicesRes] = await Promise.all([
    auth.admin
      .from("teacher_quotes")
      .select("id, amount_cents, status")
      .eq("school_year", annee),
    auth.admin
      .from("teacher_invoices")
      .select("id, amount_cents, status")
      .eq("school_year", annee),
    auth.admin.from("teacher_quotes").select("school_year"),
    auth.admin.from("teacher_invoices").select("school_year"),
  ]);

  for (const r of [quotesRes, invoicesRes, anneesQuotesRes, anneesInvoicesRes]) {
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  }

  const quotes = quotesRes.data || [];
  const invoices = invoicesRes.data || [];

  // Liste des années scolaires connues (pour le sélecteur), la plus récente
  // d'abord, avec l'année en cours toujours présente.
  const anneesSet = new Set([annee, currentSchoolYear()]);
  for (const row of [...(anneesQuotesRes.data || []), ...(anneesInvoicesRes.data || [])]) {
    if (row.school_year) anneesSet.add(row.school_year);
  }
  const annees = [...anneesSet].sort().reverse();

  const somme = (liste, filtre) => {
    const items = filtre ? liste.filter(filtre) : liste;
    return {
      count: items.length,
      total_cents: items.reduce((s, x) => s + (x.amount_cents || 0), 0),
    };
  };

  const devisValides = somme(quotes, (q) => q.status === "valide");
  const devisSoumis = somme(quotes, (q) => q.status === "soumis");
  const devisRefuses = somme(quotes, (q) => q.status === "refuse");
  const facturesToutes = somme(invoices);
  const facturesRemboursees = somme(invoices, (f) => f.status === "remboursee");
  const facturesEnAttente = somme(invoices, (f) => f.status === "soumise");

  // Récap par classe.
  const quoteIds = quotes.filter((q) => q.status === "valide").map((q) => q.id);
  const invoiceIds = invoices.map((f) => f.id);
  const montantDevis = Object.fromEntries(quotes.map((q) => [q.id, q.amount_cents || 0]));
  const montantFacture = Object.fromEntries(invoices.map((f) => [f.id, f.amount_cents || 0]));

  const [qClassesRes, iClassesRes] = await Promise.all([
    quoteIds.length
      ? auth.admin
          .from("teacher_quote_classes")
          .select("quote_id, class_label")
          .in("quote_id", quoteIds)
      : Promise.resolve({ data: [] }),
    invoiceIds.length
      ? auth.admin
          .from("teacher_invoice_classes")
          .select("invoice_id, class_label")
          .in("invoice_id", invoiceIds)
      : Promise.resolve({ data: [] }),
  ]);

  const parClasse = {};
  const ligne = (c) =>
    (parClasse[c] ||= {
      classe: c,
      devis_valides_cents: 0,
      devis_valides_count: 0,
      factures_cents: 0,
      factures_count: 0,
    });

  // Regroupe les classes de chaque devis / facture, puis répartit le montant.
  const classesParDocument = (lignes, cle) => {
    const out = {};
    for (const l of lignes || []) (out[l[cle]] ||= []).push(l.class_label);
    return out;
  };
  const repartir = (classesParDoc, montants, champCents, champCount) => {
    for (const [id, labels] of Object.entries(classesParDoc)) {
      const classes = [...new Set(labels)].sort(comparerClasses);
      const parts = repartirEgal(montants[id] || 0, classes.length);
      classes.forEach((c, i) => {
        const r = ligne(c);
        r[champCents] += parts[i];
        r[champCount] += 1;
      });
    }
  };
  repartir(classesParDocument(qClassesRes.data, "quote_id"), montantDevis, "devis_valides_cents", "devis_valides_count");
  repartir(classesParDocument(iClassesRes.data, "invoice_id"), montantFacture, "factures_cents", "factures_count");

  const classes = Object.values(parClasse).sort((a, b) => comparerClasses(a.classe, b.classe));

  return NextResponse.json({
    ok: true,
    annee,
    annees,
    totaux: {
      devis_valides: devisValides,
      devis_soumis: devisSoumis,
      devis_refuses: devisRefuses,
      factures_toutes: facturesToutes,
      factures_remboursees: facturesRemboursees,
      factures_en_attente: facturesEnAttente,
      // « engagé » = ce que le Sou s'est engagé à financer cette année.
      engage_cents: devisValides.total_cents + facturesToutes.total_cents,
    },
    classes,
    // Rappel affichable : une facture rattachée à un devis validé est comptée
    // dans les deux → le total « engagé » peut légèrement surestimer.
    note_double_compte: true,
  });
}
