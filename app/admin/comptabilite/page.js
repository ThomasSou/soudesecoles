"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../admin-shell";
import {
  CLASSES_REFERENCE,
  GROUPES_CLASSES,
  libelleClasse,
} from "../../lib/classesReference";
import { repartirEgal } from "../../lib/comptaRepartition";
import { currentSchoolYear } from "../../lib/anneeScolaire";

// Groupes de classes pour le sélecteur, construits directement depuis la
// référence (jamais dépendants de la réponse de l'API — le sélecteur ne
// peut donc pas se retrouver vide).
const GROUPES = Object.keys(GROUPES_CLASSES).map((g) => ({
  cle: g,
  nom: GROUPES_CLASSES[g],
  classes: CLASSES_REFERENCE.filter((c) => c.groupe === g).map((c) => ({
    cle: c.cle,
    libelle: libelleClasse(c.cle),
  })),
}));

const RUBRIQUES = {
  evenement: "Événement",
  investissement: "Investissement",
  courant: "Fonctionnement courant",
  classe: "Classe",
};

const STATUTS = {
  prevu: { label: "Prévisionnel", classe: "bg-slate-100 text-slate-600" },
  a_verifier: { label: "À vérifier", classe: "bg-amber-50 text-amber-700" },
  pointe: { label: "Pointé", classe: "bg-green-50 text-green-700" },
};

const COMPTES = { courant: "Compte courant", placement: "Compte placement" };

function euros(cents) {
  return ((cents || 0) / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Justificatif accepté : image ou PDF (même limite que l'espace enseignant,
// contrôlée côté serveur : 8 Mo).
const TYPES_JUSTIF = "image/*,application/pdf";

// Nature du document joint. Le voyant ne passe au vert que sur une facture
// définitive.
const TYPES_DOC = {
  devis: "Devis",
  facture_provisoire: "Facture provisoire",
  facture_definitive: "Facture définitive",
};

// État du justificatif d'une ligne, pour le voyant et les libellés.
function voyantJustif(ligne) {
  if (ligne.a_justificatif_propre) {
    const t = ligne.justificatif_type;
    return {
      ok: t === "facture_definitive",
      label: TYPES_DOC[t] || "Document joint",
    };
  }
  if (ligne.a_justificatif) return { ok: true, label: "Facture enseignant" };
  return { ok: false, label: "Facture manquante" };
}

// Petit tableau récapitulatif (par classe ou par manifestation), réalisé
// d'un côté, prévisionnel de l'autre — jamais mélangés.
function Recap({ titre, entrees }) {
  const lignes = (entrees || [])
    .filter(
      (e) =>
        e.realise.depense_cents ||
        e.realise.recette_cents ||
        e.previsionnel.depense_cents ||
        e.previsionnel.recette_cents
    )
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  if (lignes.length === 0) return null;
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-slate-700 mb-1">{titre}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border border-slate-200 rounded-lg">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-2 py-1 font-medium">&nbsp;</th>
              <th className="text-right px-2 py-1 font-medium">Dépenses réalisées</th>
              <th className="text-right px-2 py-1 font-medium">Recettes réalisées</th>
              <th className="text-right px-2 py-1 font-medium">Prévisionnel</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((e) => {
              const prev = e.previsionnel.depense_cents - e.previsionnel.recette_cents;
              return (
                <tr key={e.label} className="border-t border-slate-100">
                  <td className="px-2 py-1">{e.label}</td>
                  <td className="px-2 py-1 text-right text-red-700">
                    {e.realise.depense_cents ? euros(e.realise.depense_cents) : "—"}
                  </td>
                  <td className="px-2 py-1 text-right text-green-700">
                    {e.realise.recette_cents ? euros(e.realise.recette_cents) : "—"}
                  </td>
                  <td className="px-2 py-1 text-right text-slate-500">
                    {prev ? euros(prev) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const centsVersTexte = (m) =>
  Object.fromEntries(Object.entries(m || {}).map(([k, v]) => [k, (v / 100).toFixed(2)]));

const texteVersCents = (v) =>
  Math.round((Number(String(v ?? "").replace(",", ".")) || 0) * 100);

// Éditeur de répartition d'un montant entre plusieurs classes / manifestations.
// items : [{ key, label }]. Masqué s'il y a moins de 2 éléments.
function RepartitionEditor({ mode, setMode, items, montants, setMontants, totalCents }) {
  if (items.length < 2) return null;
  const sommeCents = items.reduce((s, it) => s + texteVersCents(montants[it.key]), 0);
  const ok = mode !== "differenciee" || sommeCents === totalCents;
  const fmt = (c) =>
    (c / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
      <div className="flex flex-wrap gap-1.5">
        {[
          ["egale", "Répartition égale"],
          ["differenciee", "Montants différenciés"],
        ].map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              if (k === "differenciee") {
                const parts = repartirEgal(totalCents, items.length);
                const nv = { ...montants };
                items.forEach((it, i) => {
                  if (nv[it.key] == null || nv[it.key] === "") {
                    nv[it.key] = (parts[i] / 100).toFixed(2);
                  }
                });
                setMontants(nv);
              }
              setMode(k);
            }}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              mode === k
                ? "bg-sou-blue text-white"
                : "bg-white border border-slate-300 text-slate-600"
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {mode === "differenciee" && (
        <div className="space-y-1">
          {items.map((it) => (
            <div key={it.key} className="flex items-center gap-2 text-xs">
              <span className="flex-1 min-w-0 truncate">{it.label}</span>
              <input
                value={montants[it.key] ?? ""}
                inputMode="decimal"
                onChange={(e) => setMontants({ ...montants, [it.key]: e.target.value })}
                className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-right"
                placeholder="0,00"
              />
              <span className="text-slate-400">€</span>
            </div>
          ))}
          <p className={`text-xs font-semibold ${ok ? "text-green-700" : "text-red-600"}`}>
            Total réparti : {fmt(sommeCents)} € / montant de la ligne : {fmt(totalCents)} €
            {ok ? " ✓" : " — à ajuster"}
          </p>
        </div>
      )}
    </div>
  );
}

// Lit le fichier choisi et le renvoie en data URL base64, pour l'envoyer
// dans le corps JSON de la requête.
function lireFichier(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error("lecture impossible"));
    r.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Formulaire d'une ligne (création ou édition d'une ligne manuelle).
// ---------------------------------------------------------------------------
function LigneForm({ accessToken, annees, evenements, ligne, onDone, onCancel }) {
  const edition = Boolean(ligne);
  const groupes = GROUPES;
  const anneesOptions = [
    ...new Set([
      currentSchoolYear(),
      ...(annees || []),
      ...(ligne?.school_year ? [ligne.school_year] : []),
    ]),
  ].sort().reverse();
  const [anneeLigne, setAnneeLigne] = useState(
    ligne?.school_year || currentSchoolYear()
  );
  const [sens, setSens] = useState(ligne?.sens || "depense");
  const [rubrique, setRubrique] = useState(ligne?.rubrique || "evenement");
  const [evenementsSel, setEvenementsSel] = useState(
    ligne?.evenements || (ligne?.evenement_id ? [ligne.evenement_id] : [])
  );
  const [evenementsLocaux, setEvenementsLocaux] = useState([]);
  const [nouvelleManif, setNouvelleManif] = useState("");
  const [classesSel, setClassesSel] = useState(ligne?.classes || []);
  const [repartitionClasses, setRepartitionClasses] = useState(
    ligne?.repartitionClasses || "egale"
  );
  const [classesMontants, setClassesMontants] = useState(
    centsVersTexte(ligne?.classesMontants)
  );
  const [repartitionEvenements, setRepartitionEvenements] = useState(
    ligne?.repartitionEvenements || "egale"
  );
  const [evenementsMontants, setEvenementsMontants] = useState(
    centsVersTexte(ligne?.evenementsMontants)
  );
  const [libelle, setLibelle] = useState(ligne?.libelle || "");
  const [fournisseur, setFournisseur] = useState(ligne?.fournisseur || "");
  const [montant, setMontant] = useState(
    ligne ? String((ligne.montant_cents / 100).toFixed(2)) : ""
  );
  const [dateOperation, setDateOperation] = useState(ligne?.date_operation || "");
  const [compte, setCompte] = useState(ligne?.compte || "");
  const [statut, setStatut] = useState(ligne?.statut || "a_verifier");
  const [note, setNote] = useState(ligne?.note || "");
  const [justificatif, setJustificatif] = useState(null);
  const [justificatifType, setJustificatifType] = useState(
    ligne?.justificatif_type || "facture_definitive"
  );
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const tousEvenements = [
    ...evenements,
    ...evenementsLocaux.filter((e) => !evenements.some((x) => x.id === e.id)),
  ];

  function toggleEvenement(id) {
    setEvenementsSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function creerManifestation() {
    const nom = nouvelleManif.trim();
    if (!nom) return;
    setEnvoi(true);
    setErreur("");
    const res = await fetch("/api/admin/comptabilite/manifestations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ nom }),
    });
    const d = await res.json().catch(() => ({}));
    setEnvoi(false);
    if (!res.ok || !d.evenement) {
      setErreur(d.error || "Création de la manifestation impossible.");
      return;
    }
    setEvenementsLocaux((l) => [...l, d.evenement]);
    setEvenementsSel((s) => [...s, d.evenement.id]);
    setNouvelleManif("");
  }

  function toggleClasse(c) {
    setClassesSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  }
  function toggleGroupe(groupe) {
    const cles = groupe.classes.map((c) => c.cle);
    const toutes = cles.every((c) => classesSel.includes(c));
    setClassesSel((s) =>
      toutes ? s.filter((c) => !cles.includes(c)) : [...new Set([...s, ...cles])]
    );
  }

  const totalLigneCents = texteVersCents(montant);
  const sommeRepartie = (sel, montants) =>
    sel.reduce((s, k) => s + texteVersCents(montants[k]), 0);
  const classesDiffOk =
    rubrique !== "classe" ||
    repartitionClasses !== "differenciee" ||
    sommeRepartie(classesSel, classesMontants) === totalLigneCents;
  const evenementsDiffOk =
    rubrique !== "evenement" ||
    repartitionEvenements !== "differenciee" ||
    sommeRepartie(evenementsSel, evenementsMontants) === totalLigneCents;

  async function soumettre(e) {
    e.preventDefault();
    setErreur("");

    if (!classesDiffOk || !evenementsDiffOk) {
      setErreur(
        "La somme des montants répartis ne correspond pas au montant de la ligne."
      );
      return;
    }
    setEnvoi(true);

    let justificatifDataUrl = null;
    if (justificatif) {
      try {
        justificatifDataUrl = await lireFichier(justificatif);
      } catch {
        setErreur("Lecture du fichier impossible.");
        setEnvoi(false);
        return;
      }
    }

    const corps = {
      sens,
      rubrique,
      evenements: rubrique === "evenement" ? evenementsSel : [],
      classes: rubrique === "classe" ? classesSel : [],
      repartitionClasses: rubrique === "classe" ? repartitionClasses : undefined,
      classesMontants:
        rubrique === "classe" && repartitionClasses === "differenciee"
          ? classesMontants
          : undefined,
      repartitionEvenements: rubrique === "evenement" ? repartitionEvenements : undefined,
      evenementsMontants:
        rubrique === "evenement" && repartitionEvenements === "differenciee"
          ? evenementsMontants
          : undefined,
      libelle,
      fournisseur,
      montant: String(montant).replace(",", "."),
      dateOperation: dateOperation || null,
      compte: compte || null,
      statut,
      note,
      justificatifDataUrl,
      justificatifType,
      annee: anneeLigne,
    };
    const url = edition
      ? `/api/admin/comptabilite/${ligne.id}`
      : "/api/admin/comptabilite";
    const res = await fetch(url, {
      method: edition ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(corps),
    });
    const data = await res.json().catch(() => ({}));
    setEnvoi(false);
    if (!res.ok) {
      setErreur(data.error || "Enregistrement impossible.");
      return;
    }
    onDone();
  }

  const champ = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm";

  return (
    <form
      onSubmit={soumettre}
      className="border border-sou-blue/30 bg-sou-blue/5 rounded-xl p-4 space-y-3"
    >
      <div className="flex gap-2">
        {["depense", "recette"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSens(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
              sens === s
                ? s === "depense"
                  ? "bg-red-600 text-white"
                  : "bg-green-600 text-white"
                : "bg-white border border-slate-300 text-slate-600"
            }`}
          >
            {s === "depense" ? "Dépense" : "Recette"}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">
          Rubrique
          <select
            value={rubrique}
            onChange={(e) => setRubrique(e.target.value)}
            className={champ}
          >
            {Object.entries(RUBRIQUES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rubrique === "evenement" && (
        <div className="text-sm space-y-2">
          <p>
            Manifestation(s) concernée(s){" "}
            <span className="text-slate-400">
              — réparti à parts égales, sauf montants différenciés
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tousEvenements.length === 0 && (
              <span className="text-slate-400 text-xs">
                Aucune manifestation. Ajoutez-en une ci-dessous.
              </span>
            )}
            {tousEvenements.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => toggleEvenement(ev.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  evenementsSel.includes(ev.id)
                    ? "bg-sou-blue text-white"
                    : "bg-white border border-slate-300 text-slate-600"
                }`}
              >
                {ev.nom}
              </button>
            ))}
          </div>
          <RepartitionEditor
            mode={repartitionEvenements}
            setMode={setRepartitionEvenements}
            items={evenementsSel.map((id) => ({
              key: id,
              label: tousEvenements.find((e) => e.id === id)?.nom || "Manifestation",
            }))}
            montants={evenementsMontants}
            setMontants={setEvenementsMontants}
            totalCents={totalLigneCents}
          />
          <div className="flex gap-2">
            <input
              value={nouvelleManif}
              onChange={(e) => setNouvelleManif(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  creerManifestation();
                }
              }}
              className={champ}
              placeholder="Nouvelle manifestation (ex. Vide-greniers 2026)"
            />
            <button
              type="button"
              onClick={creerManifestation}
              disabled={envoi || !nouvelleManif.trim()}
              className="shrink-0 text-xs font-semibold text-sou-blue px-3 border border-sou-blue/40 rounded-lg disabled:opacity-40"
            >
              Ajouter
            </button>
          </div>
        </div>
      )}

      {rubrique === "classe" && (
        <div className="text-sm space-y-2">
          <p>
            Classe(s) concernée(s){" "}
            <span className="text-slate-400">
              — le montant est réparti à parts égales entre les classes cochées
            </span>
          </p>
          {groupes.map((g) => {
            const cles = g.classes.map((c) => c.cle);
            const toutes = cles.length > 0 && cles.every((c) => classesSel.includes(c));
            return (
              <div key={g.cle}>
                <button
                  type="button"
                  onClick={() => toggleGroupe(g)}
                  className="text-xs font-semibold text-sou-blue"
                >
                  {toutes ? "Décocher" : "Cocher"} toutes les {g.nom.toLowerCase()}s
                </button>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {g.classes.map((c) => (
                    <button
                      key={c.cle}
                      type="button"
                      onClick={() => toggleClasse(c.cle)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        classesSel.includes(c.cle)
                          ? "bg-sou-blue text-white"
                          : "bg-white border border-slate-300 text-slate-600"
                      }`}
                    >
                      {c.libelle}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <RepartitionEditor
            mode={repartitionClasses}
            setMode={setRepartitionClasses}
            items={classesSel.map((c) => ({ key: c, label: libelleClasse(c) }))}
            montants={classesMontants}
            setMontants={setClassesMontants}
            totalCents={totalLigneCents}
          />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">
          Libellé
          <input
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            className={champ}
            placeholder="Location camion, facture boucher…"
          />
        </label>
        <label className="text-sm">
          Fournisseur (facultatif)
          <input
            value={fournisseur}
            onChange={(e) => setFournisseur(e.target.value)}
            className={champ}
          />
        </label>
        <label className="text-sm">
          Montant (€ TTC)
          <input
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            className={champ}
            inputMode="decimal"
            placeholder="0,00"
          />
        </label>
        <label className="text-sm">
          Date de l&apos;opération (facultatif)
          <input
            type="date"
            value={dateOperation}
            onChange={(e) => setDateOperation(e.target.value)}
            className={champ}
          />
        </label>
        <label className="text-sm">
          Compte bancaire (facultatif)
          <select
            value={compte}
            onChange={(e) => setCompte(e.target.value)}
            className={champ}
          >
            <option value="">—</option>
            {Object.entries(COMPTES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Statut
          <select
            value={statut}
            onChange={(e) => setStatut(e.target.value)}
            className={champ}
          >
            {Object.entries(STATUTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Année scolaire{" "}
          <span className="text-slate-400">(pré-remplie sur l&apos;année en cours)</span>
          <select
            value={anneeLigne}
            onChange={(e) => setAnneeLigne(e.target.value)}
            className={champ}
          >
            {anneesOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="text-sm block">
        Note interne (facultatif)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className={champ}
        />
      </label>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm block">
          Justificatif — devis ou facture (PDF ou image, facultatif)
          {edition && ligne?.a_justificatif_propre && (
            <span className="block text-xs text-green-700">
              Un document est déjà joint. En choisir un nouveau le remplacera.
            </span>
          )}
          <input
            type="file"
            accept={TYPES_JUSTIF}
            onChange={(e) => setJustificatif(e.target.files?.[0] || null)}
            className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-sou-blue/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-sou-blue"
          />
        </label>
        <label className="text-sm block">
          Nature du document
          <select
            value={justificatifType}
            onChange={(e) => setJustificatifType(e.target.value)}
            className={champ}
          >
            {Object.entries(TYPES_DOC).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {justificatif && justificatifType === "devis" && (
            <span className="block text-xs text-slate-500">
              La ligne sera enregistrée en <strong>prévisionnel</strong> tant
              qu&apos;une facture ne remplace pas le devis.
            </span>
          )}
        </label>
      </div>

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={envoi || !classesDiffOk || !evenementsDiffOk}
          className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50"
        >
          {edition ? "Enregistrer" : "Ajouter la ligne"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-slate-500 px-3"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Une ligne dans la liste.
// ---------------------------------------------------------------------------
function LigneRow({ accessToken, ligne, evenements, annees, onChange }) {
  const [edition, setEdition] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const statut = STATUTS[ligne.statut] || STATUTS.a_verifier;
  const voyant = voyantJustif(ligne);
  const idsEvenement =
    ligne.evenements && ligne.evenements.length
      ? ligne.evenements
      : ligne.evenement_id
        ? [ligne.evenement_id]
        : [];
  const evtDiff = ligne.repartitionEvenements === "differenciee";
  const nomEvenement =
    ligne.rubrique === "evenement"
      ? idsEvenement
          .map((id) => {
            const n = evenements.find((e) => e.id === id)?.nom || "Manifestation";
            return evtDiff ? `${n} (${euros(ligne.evenementsMontants?.[id] || 0)})` : n;
          })
          .join(", ")
      : null;
  const classeDiff = ligne.repartitionClasses === "differenciee";

  async function patch(corps) {
    setEnvoi(true);
    const res = await fetch(`/api/admin/comptabilite/${ligne.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(corps),
    });
    setEnvoi(false);
    if (res.ok) onChange();
    else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Modification impossible.");
    }
  }

  async function joindreJustificatif(file) {
    if (!file) return;
    let dataUrl;
    try {
      dataUrl = await lireFichier(file);
    } catch {
      alert("Lecture du fichier impossible.");
      return;
    }
    patch({ justificatifDataUrl: dataUrl });
  }

  async function retirerJustificatif() {
    if (!confirm("Retirer le justificatif joint à cette ligne ?")) return;
    patch({ retirerJustificatif: true });
  }

  async function voirJustificatif() {
    const res = await fetch(`/api/admin/comptabilite/${ligne.id}/fichier`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.url) window.open(d.url, "_blank", "noopener");
    else alert(d.error || "Justificatif indisponible.");
  }

  async function supprimer() {
    if (!confirm("Supprimer cette ligne ?")) return;
    setEnvoi(true);
    const res = await fetch(`/api/admin/comptabilite/${ligne.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setEnvoi(false);
    if (res.ok) onChange();
    else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Suppression impossible.");
    }
  }

  if (edition) {
    return (
      <LigneForm
        accessToken={accessToken}
        annees={annees}
        evenements={evenements}
        ligne={ligne}
        onDone={() => {
          setEdition(false);
          onChange();
        }}
        onCancel={() => setEdition(false)}
      />
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-800">{ligne.libelle}</p>
          <p className="text-xs text-slate-500">
            <span className="inline-block bg-slate-100 rounded px-1.5 py-0.5 mr-1">
              {RUBRIQUES[ligne.rubrique]}
            </span>
            {nomEvenement && <span>{nomEvenement}</span>}
            {ligne.rubrique === "classe" && ligne.classes.length > 0 && (
              <span>
                {ligne.classes
                  .map((c) =>
                    classeDiff
                      ? `${libelleClasse(c)} (${euros(ligne.classesMontants?.[c] || 0)})`
                      : libelleClasse(c)
                  )
                  .join(", ")}
              </span>
            )}
            {ligne.fournisseur && <span> · {ligne.fournisseur}</span>}
            {ligne.source === "enseignant" && (
              <span className="text-sou-blue"> · facture enseignant</span>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p
            className={`font-semibold ${
              ligne.sens === "recette" ? "text-green-700" : "text-red-700"
            }`}
          >
            {ligne.sens === "recette" ? "+" : "−"} {euros(ligne.montant_cents)}
          </p>
          <p className="text-xs text-slate-400">{formatDate(ligne.date_operation)}</p>
          <div className="flex flex-col items-end gap-1 mt-0.5">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statut.classe}`}
            >
              {statut.label}
            </span>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                voyant.ok
                  ? "bg-green-50 text-green-700"
                  : "bg-amber-50 text-amber-700"
              }`}
              title={
                ligne.a_justificatif && !ligne.a_justificatif_propre
                  ? "Justificatif repris de la facture enseignant"
                  : undefined
              }
            >
              {voyant.label}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {Object.entries(STATUTS).map(([k, v]) => (
          <button
            key={k}
            disabled={envoi || ligne.statut === k}
            onClick={() => patch({ statut: k })}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full disabled:opacity-40 ${
              ligne.statut === k
                ? v.classe
                : "border border-slate-300 text-slate-600"
            }`}
          >
            {v.label}
          </button>
        ))}

        {ligne.source === "manuel" && (
          <>
            <button
              onClick={() => setEdition(true)}
              className="text-xs font-semibold text-sou-blue px-2"
            >
              Éditer
            </button>
            <button
              onClick={supprimer}
              disabled={envoi}
              className="text-xs font-semibold text-red-600 px-2 disabled:opacity-40"
            >
              Supprimer
            </button>
          </>
        )}

        <span className="mx-1 text-slate-300">|</span>

        {ligne.a_justificatif && (
          <button
            onClick={voirJustificatif}
            className="text-xs font-semibold text-sou-blue px-2"
          >
            Voir le document
          </button>
        )}
        <label className="text-xs font-semibold text-sou-blue px-2 cursor-pointer">
          {ligne.a_justificatif_propre ? "Remplacer" : "Joindre un document"}
          <input
            type="file"
            accept={TYPES_JUSTIF}
            disabled={envoi}
            className="hidden"
            onChange={(e) => {
              joindreJustificatif(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {ligne.a_justificatif_propre && (
          <>
            <select
              value={ligne.justificatif_type || "facture_definitive"}
              disabled={envoi}
              onChange={(e) => patch({ justificatifType: e.target.value })}
              className="text-xs border border-slate-300 rounded-full px-2 py-1 text-slate-600 disabled:opacity-40"
              title="Nature du document joint"
            >
              {Object.entries(TYPES_DOC).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button
              onClick={retirerJustificatif}
              disabled={envoi}
              className="text-xs font-semibold text-red-600 px-2 disabled:opacity-40"
            >
              Retirer
            </button>
          </>
        )}
      </div>

      {ligne.statut === "pointe" && (
        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-100">
          <select
            defaultValue={ligne.compte || ""}
            onChange={(e) => patch({ compte: e.target.value || null })}
            className="border border-slate-200 rounded-lg px-2 py-1 text-xs"
          >
            <option value="">Compte —</option>
            {Object.entries(COMPTES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            defaultValue={ligne.ref_bancaire || ""}
            onBlur={(e) => {
              if ((e.target.value || "") !== (ligne.ref_bancaire || ""))
                patch({ refBancaire: e.target.value });
            }}
            placeholder="Référence sur le relevé"
            className="flex-1 min-w-[10rem] border border-slate-200 rounded-lg px-2 py-1 text-xs"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page.
// ---------------------------------------------------------------------------
function ComptaAdmin({ accessToken }) {
  const [annee, setAnnee] = useState("");
  const [data, setData] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [rubrique, setRubrique] = useState("");
  const [evenementId, setEvenementId] = useState("");
  const [classe, setClasse] = useState("");
  const [statut, setStatut] = useState("");
  const [sens, setSens] = useState("");
  const [ajout, setAjout] = useState(false);

  const recharger = useCallback(() => {
    setChargement(true);
    const p = new URLSearchParams();
    if (annee) p.set("annee", annee);
    if (rubrique) p.set("rubrique", rubrique);
    if (rubrique === "evenement" && evenementId) p.set("evenementId", evenementId);
    if (rubrique === "classe" && classe) p.set("classe", classe);
    if (statut) p.set("statut", statut);
    if (sens) p.set("sens", sens);
    fetch(`/api/admin/comptabilite?${p.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (!annee && d.annee) setAnnee(d.annee);
      })
      .finally(() => setChargement(false));
  }, [accessToken, annee, rubrique, evenementId, classe, statut, sens]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  const totaux = data?.totaux?.global || { depense_cents: 0, recette_cents: 0 };
  const solde = totaux.recette_cents - totaux.depense_cents;
  const aVerifier = data?.totaux?.parStatut?.a_verifier;
  const pointe = data?.totaux?.parStatut?.pointe;
  const previsionnel = data?.totaux?.parStatut?.prevu;
  const entreesClasses = Object.entries(data?.totaux?.parClasse || {}).map(([cle, v]) => ({
    label: v.libelle || libelleClasse(cle),
    realise: v.realise,
    previsionnel: v.previsionnel,
  }));
  const entreesEvenements = Object.entries(data?.totaux?.parEvenement || {}).map(([id, v]) => ({
    label: v.nom || "Manifestation",
    realise: v.realise,
    previsionnel: v.previsionnel,
  }));

  const pilule = (actif, onClick, texte) => (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium ${
        actif
          ? "bg-sou-blue text-white"
          : "bg-white border border-slate-300 text-slate-600"
      }`}
    >
      {texte}
    </button>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-sou-blue mb-1">Comptabilité</h1>
      <p className="text-slate-500 text-sm mb-6">
        Dépenses et recettes de l&apos;association, par événement, par classe,
        en investissement ou en fonctionnement courant. Tout est en TTC. Les
        factures des enseignants apparaissent automatiquement en dépenses par
        classe. Un devis joint met la ligne en <strong>prévisionnel</strong>{" "}
        jusqu&apos;à ce qu&apos;une facture le remplace. Une dépense partagée se
        répartit à parts égales entre les classes / manifestations, ou avec des
        montants différenciés. Import des relevés Crédit Agricole et pointage
        automatique : à venir.
      </p>

      {data?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {data.error}
        </p>
      )}

      {/* Filtres */}
      <div className="space-y-2 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-500">Année</label>
          <select
            value={annee}
            onChange={(e) => setAnnee(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          >
            {(data?.annees || []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {pilule(rubrique === "", () => setRubrique(""), "Toutes rubriques")}
          {Object.entries(RUBRIQUES).map(([k, v]) =>
            pilule(rubrique === k, () => setRubrique(k), v)
          )}
        </div>

        {rubrique === "evenement" && (
          <select
            value={evenementId}
            onChange={(e) => setEvenementId(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="">Tous les événements</option>
            {(data?.evenements || []).map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.nom}
              </option>
            ))}
          </select>
        )}
        {rubrique === "classe" && (
          <select
            value={classe}
            onChange={(e) => setClasse(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="">Toutes les classes</option>
            {CLASSES_REFERENCE.map((c) => (
              <option key={c.cle} value={c.cle}>
                {libelleClasse(c.cle)}
              </option>
            ))}
            {(data?.classesEnPlus || []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        <div className="flex flex-wrap gap-1.5">
          {pilule(sens === "", () => setSens(""), "Dépenses + recettes")}
          {pilule(sens === "depense", () => setSens("depense"), "Dépenses")}
          {pilule(sens === "recette", () => setSens("recette"), "Recettes")}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pilule(statut === "", () => setStatut(""), "Tous statuts")}
          {Object.entries(STATUTS).map(([k, v]) =>
            pilule(statut === k, () => setStatut(k), v.label)
          )}
        </div>
      </div>

      {/* Totaux */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500">Dépenses</p>
          <p className="text-lg font-bold text-red-700">
            {euros(totaux.depense_cents)}
          </p>
          {previsionnel?.depense_cents ? (
            <p className="text-[11px] text-slate-400">
              dont prévisionnel {euros(previsionnel.depense_cents)}
            </p>
          ) : null}
        </div>
        <div className="border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500">Recettes</p>
          <p className="text-lg font-bold text-green-700">
            {euros(totaux.recette_cents)}
          </p>
          {previsionnel?.recette_cents ? (
            <p className="text-[11px] text-slate-400">
              dont prévisionnel {euros(previsionnel.recette_cents)}
            </p>
          ) : null}
        </div>
        <div className="border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500">Solde</p>
          <p
            className={`text-lg font-bold ${
              solde >= 0 ? "text-green-700" : "text-red-700"
            }`}
          >
            {euros(solde)}
          </p>
        </div>
      </div>
      {(aVerifier || pointe) && (
        <p className="text-xs text-slate-500 mb-4">
          À vérifier :{" "}
          {euros(
            (aVerifier?.depense_cents || 0) + (aVerifier?.recette_cents || 0)
          )}{" "}
          · Pointé :{" "}
          {euros((pointe?.depense_cents || 0) + (pointe?.recette_cents || 0))}
        </p>
      )}

      <Recap titre="Comptes par classe" entrees={entreesClasses} />
      <Recap titre="Comptes par manifestation" entrees={entreesEvenements} />

      {/* Ajout */}
      <div className="mb-4">
        {ajout ? (
          <LigneForm
            accessToken={accessToken}
            annees={data?.annees || []}
            evenements={data?.evenements || []}
            onDone={() => {
              setAjout(false);
              recharger();
            }}
            onCancel={() => setAjout(false)}
          />
        ) : (
          <button
            onClick={() => setAjout(true)}
            className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full"
          >
            + Ajouter une dépense ou une recette
          </button>
        )}
      </div>

      {/* Liste */}
      {chargement ? (
        <p className="text-slate-500 text-sm">Chargement…</p>
      ) : !data?.lignes || data.lignes.length === 0 ? (
        <p className="text-slate-500 text-sm">
          Aucune ligne pour ces filtres.
        </p>
      ) : (
        <div className="space-y-2">
          {data.lignes.map((l) => (
            <LigneRow
              key={l.id}
              accessToken={accessToken}
              ligne={l}
              evenements={data.evenements || []}
              annees={data.annees || []}
              onChange={recharger}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminComptabilitePage() {
  return (
    <AdminShell title="Comptabilité">
      {(accessToken) => <ComptaAdmin accessToken={accessToken} />}
    </AdminShell>
  );
}
