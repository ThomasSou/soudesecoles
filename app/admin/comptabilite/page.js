"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../admin-shell";

const RUBRIQUES = {
  evenement: "Événement",
  investissement: "Investissement",
  courant: "Fonctionnement courant",
  classe: "Classe",
};

const STATUTS = {
  prevu: { label: "Prévu", classe: "bg-slate-100 text-slate-600" },
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

// ---------------------------------------------------------------------------
// Formulaire d'une ligne (création ou édition d'une ligne manuelle).
// ---------------------------------------------------------------------------
function LigneForm({ accessToken, annee, evenements, classes, ligne, onDone, onCancel }) {
  const edition = Boolean(ligne);
  const [sens, setSens] = useState(ligne?.sens || "depense");
  const [rubrique, setRubrique] = useState(ligne?.rubrique || "evenement");
  const [evenementId, setEvenementId] = useState(ligne?.evenement_id || "");
  const [classesSel, setClassesSel] = useState(ligne?.classes || []);
  const [libelle, setLibelle] = useState(ligne?.libelle || "");
  const [fournisseur, setFournisseur] = useState(ligne?.fournisseur || "");
  const [montant, setMontant] = useState(
    ligne ? String((ligne.montant_cents / 100).toFixed(2)) : ""
  );
  const [dateOperation, setDateOperation] = useState(ligne?.date_operation || "");
  const [compte, setCompte] = useState(ligne?.compte || "");
  const [statut, setStatut] = useState(ligne?.statut || "a_verifier");
  const [note, setNote] = useState(ligne?.note || "");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  function toggleClasse(c) {
    setClassesSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  }

  async function soumettre(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    const corps = {
      sens,
      rubrique,
      evenementId: rubrique === "evenement" ? evenementId : null,
      classes: rubrique === "classe" ? classesSel : [],
      libelle,
      fournisseur,
      montant: String(montant).replace(",", "."),
      dateOperation: dateOperation || null,
      compte: compte || null,
      statut,
      note,
      annee,
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

        {rubrique === "evenement" && (
          <label className="text-sm">
            Événement
            <select
              value={evenementId}
              onChange={(e) => setEvenementId(e.target.value)}
              className={champ}
            >
              <option value="">— choisir —</option>
              {evenements.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.nom}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {rubrique === "classe" && (
        <div className="text-sm">
          Classe(s) concernée(s)
          <div className="flex flex-wrap gap-1.5 mt-1">
            {classes.length === 0 && (
              <span className="text-slate-400 text-xs">
                Aucune classe connue pour cette année (les classes viennent des
                fiches enfants).
              </span>
            )}
            {classes.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleClasse(c)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  classesSel.includes(c)
                    ? "bg-sou-blue text-white"
                    : "bg-white border border-slate-300 text-slate-600"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
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

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={envoi}
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
function LigneRow({ accessToken, ligne, evenements, classes, annee, onChange }) {
  const [edition, setEdition] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const statut = STATUTS[ligne.statut] || STATUTS.a_verifier;
  const nomEvenement =
    ligne.rubrique === "evenement"
      ? evenements.find((e) => e.id === ligne.evenement_id)?.nom || "Événement"
      : null;

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
        annee={annee}
        evenements={evenements}
        classes={classes}
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
              <span>{ligne.classes.join(", ")}</span>
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
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statut.classe}`}
          >
            {statut.label}
          </span>
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
        classe. Import des relevés Crédit Agricole et pointage automatique :
        à venir.
      </p>

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
            {(data?.classes || []).map((c) => (
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
        </div>
        <div className="border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500">Recettes</p>
          <p className="text-lg font-bold text-green-700">
            {euros(totaux.recette_cents)}
          </p>
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

      {/* Ajout */}
      <div className="mb-4">
        {ajout ? (
          <LigneForm
            accessToken={accessToken}
            annee={annee}
            evenements={data?.evenements || []}
            classes={data?.classes || []}
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
              classes={data.classes || []}
              annee={annee}
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
