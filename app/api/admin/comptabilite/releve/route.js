import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import {
  candidatsPourOperation,
  chargerLiens,
  chargerModeles,
  pointerAutomatiquement,
  signatureOperation,
  sommeLiens,
} from "../../../../lib/comptaPointage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const STATUTS = ["a_pointer", "pointee", "ignoree"];
const MAX_OPERATIONS = 3000;

const tableAbsente = (message) =>
  /compta_operations/.test(message || "") && /(does not exist|schema cache|could not find)/i.test(message || "");

// Version compacte d'une ligne de compta pour l'écran de rapprochement.
const resume = (l) => ({
  id: l.id,
  sens: l.sens,
  rubrique: l.rubrique,
  libelle: l.libelle,
  fournisseur: l.fournisseur,
  montant_cents: l.montant_cents,
  date_operation: l.date_operation,
  statut: l.statut,
  school_year: l.school_year,
});

// Opérations du relevé, avec pour chacune à pointer les lignes de compta
// candidates (même sens, même montant que la part restante), et pour chacune
// déjà répartie les lignes liées. Une opération est « pointée » quand la somme
// de ses lignes égale son montant (table compta_operation_lignes).
export async function GET(request) {
  const auth = await requirePermission(request, "comptabilite");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = new URL(request.url).searchParams;
  const depuis = /^\d{4}-\d{2}-\d{2}$/.test(params.get("depuis") || "") ? params.get("depuis") : null;
  const statut = STATUTS.includes(params.get("statut")) ? params.get("statut") : null;
  const sens = ["depense", "recette"].includes(params.get("sens")) ? params.get("sens") : null;

  let requete = auth.admin
    .from("compta_operations")
    .select("*")
    .order("date_operation", { ascending: false })
    .order("importe_le", { ascending: false })
    .limit(MAX_OPERATIONS);
  if (depuis) requete = requete.gte("date_operation", depuis);
  const { data: toutes, error } = await requete;
  if (error) {
    if (tableAbsente(error.message)) return NextResponse.json({ migrationManquante: "0054" });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const liens = await chargerLiens(auth.admin);
  if (liens.absente) return NextResponse.json({ migrationManquante: "0055" });
  if (liens.erreur) return NextResponse.json({ error: liens.erreur }, { status: 500 });

  // Statut effectif : « écartée » est un choix ; sinon, « pointée » seulement
  // si les lignes liées couvrent tout le montant (une ligne supprimée ou
  // détachée ramène l'opération à pointer).
  const operations = (toutes || []).map((o) => {
    const l = liens.parOperation[o.id] || [];
    const somme = sommeLiens(l);
    const effectif = o.statut === "ignoree" ? "ignoree" : somme >= o.montant_cents ? "pointee" : "a_pointer";
    return { ...o, statut: effectif, reste_cents: Math.max(0, o.montant_cents - somme), a_des_liens: l.length > 0 };
  });

  const compteurs = { a_pointer: 0, pointee: 0, ignoree: 0, a_pointer_cents: 0 };
  for (const o of operations) {
    compteurs[o.statut]++;
    if (o.statut === "a_pointer") compteurs.a_pointer_cents += o.reste_cents;
  }

  let visibles = operations;
  if (statut) visibles = visibles.filter((o) => o.statut === statut);
  if (sens) visibles = visibles.filter((o) => o.sens === sens);

  // Lignes de compta disponibles au rapprochement : non pointées, pas déjà
  // liées à une opération.
  const { data: lignesOuvertes } = await auth.admin
    .from("compta_lignes")
    .select("*")
    .in("statut", ["a_verifier", "prevu", "a_valider"]);
  const libres = (lignesOuvertes || []).filter((l) => !liens.prises.has(l.id));

  const idsParents = [...new Set(libres.map((l) => l.paye_par_parent_id).filter(Boolean))];
  const noms = {};
  if (idsParents.length) {
    const { data: ps } = await auth.admin
      .from("parents")
      .select("id, first_name, last_name")
      .in("id", idsParents);
    for (const p of ps || []) noms[p.id] = `${p.first_name || ""} ${p.last_name || ""}`;
  }

  // Lignes liées aux opérations affichées.
  const idsLignes = [
    ...new Set(visibles.flatMap((o) => (liens.parOperation[o.id] || []).map((l) => l.ligne_id))),
  ];
  const { data: lignesLiees } = idsLignes.length
    ? await auth.admin.from("compta_lignes").select("*").in("id", idsLignes)
    : { data: [] };
  const ligneParId = Object.fromEntries((lignesLiees || []).map((l) => [l.id, resume(l)]));

  // Modèles appris : ce que le bureau a fait la dernière fois pour la même opération.
  const modeles = await chargerModeles(auth.admin);

  const resultat = visibles.map((o) => {
    const sig = o.statut === "a_pointer" && !o.a_des_liens ? signatureOperation(o) : null;
    const m = sig ? modeles.get(sig) : null;
    return {
    ...o,
    modele: m
      ? m.kind === "ignorer"
        ? { kind: "ignorer", note: m.note, fois: m.fois }
        : {
            kind: "ligne",
            rubrique: m.rubrique,
            evenements: m.evenements,
            classes: m.classes,
            libelle: m.libelle,
            fournisseur: m.fournisseur,
            fois: m.fois,
          }
      : null,
    lignes: (liens.parOperation[o.id] || []).map((l) => ligneParId[l.ligne_id]).filter(Boolean),
    suggestions:
      o.statut === "a_pointer"
        ? candidatsPourOperation({ ...o, montant_cents: o.reste_cents }, libres, noms)
            .slice(0, 5)
            .map((c) => ({ ...resume(c.ligne), score: c.score, raisons: c.raisons }))
        : [],
    };
  });

  return NextResponse.json({
    operations: resultat,
    compteurs,
    lignesOuvertes: libres.map(resume),
    tronque: (toutes || []).length >= MAX_OPERATIONS,
  });
}

// Import : reçoit les opérations lues dans le navigateur, ignore celles déjà
// connues (clé identique), puis lance le pointage automatique. Avec
// { relancer: true } et sans opérations, ne fait que relancer l'automatique.
export async function POST(request) {
  const auth = await requirePermission(request, "comptabilite");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  let nouvelles = 0;
  let connues = 0;

  if (Array.isArray(body.operations) && body.operations.length > 0) {
    if (body.operations.length > MAX_OPERATIONS) {
      return NextResponse.json({ error: `Trop d'opérations d'un coup (${MAX_OPERATIONS} maximum).` }, { status: 400 });
    }
    const lignes = [];
    for (const o of body.operations) {
      const montant = Number(o.montantCents);
      if (
        !o.cle || typeof o.cle !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(o.date || "") ||
        !["depense", "recette"].includes(o.sens) ||
        !Number.isInteger(montant) || montant <= 0 ||
        !["courant", "placement"].includes(o.compte)
      ) {
        return NextResponse.json({ error: "Le fichier contient une opération illisible." }, { status: 400 });
      }
      lignes.push({
        cle: o.cle.slice(0, 600),
        compte: o.compte,
        date_operation: o.date,
        type_operation: String(o.type || "").slice(0, 120) || null,
        libelle: String(o.libelle || "").slice(0, 600),
        detail: String(o.detail || "").slice(0, 600) || null,
        sens: o.sens,
        montant_cents: montant,
        importe_par: auth.parent.id,
      });
    }

    // Quelles clés existent déjà ? (pour compter, l'upsert ne le dit pas)
    const cles = lignes.map((l) => l.cle);
    const existantes = new Set();
    for (let i = 0; i < cles.length; i += 200) {
      const { data, error } = await auth.admin
        .from("compta_operations")
        .select("cle")
        .in("cle", cles.slice(i, i + 200));
      if (error) {
        if (tableAbsente(error.message)) return NextResponse.json({ migrationManquante: true }, { status: 409 });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      for (const d of data || []) existantes.add(d.cle);
    }
    const aInserer = lignes.filter((l) => !existantes.has(l.cle));
    connues = lignes.length - aInserer.length;
    for (let i = 0; i < aInserer.length; i += 200) {
      const { error } = await auth.admin
        .from("compta_operations")
        .upsert(aInserer.slice(i, i + 200), { onConflict: "cle", ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    nouvelles = aInserer.length;
  }

  const { pointees, apprises = 0 } = await pointerAutomatiquement(auth.admin, auth.parent.id);
  return NextResponse.json({ ok: true, nouvelles, connues, pointeesAuto: pointees, apprises });
}
