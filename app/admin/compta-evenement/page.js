"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../admin-shell";

const euros = (cents) =>
  (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const STATUTS = {
  a_valider: { label: "En attente de validation par le bureau", classe: "bg-orange-50 text-orange-700" },
  prevu: { label: "Prévisionnel (devis)", classe: "bg-slate-100 text-slate-600" },
  a_verifier: { label: "Validée", classe: "bg-green-50 text-green-700" },
  pointe: { label: "Validée", classe: "bg-green-50 text-green-700" },
};

const TAILLE_MAX_OCTETS = 4 * 1024 * 1024;

function lireFichier(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error("lecture impossible"));
    r.readAsDataURL(file);
  });
}

export default function ComptaEvenementPage() {
  return (
    <AdminShell title="Compta de mon événement">
      {(token) => <ComptaEvenement token={token} />}
    </AdminShell>
  );
}

function ComptaEvenement({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [evenementId, setEvenementId] = useState("");

  const charger = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/admin/compta-evenement", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Erreur.");
      return;
    }
    setData(d);
    setEvenementId((courant) => courant || d.evenements?.[0]?.id || "");
  }, [token]);

  useEffect(() => {
    charger();
  }, [charger]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-slate-500">Chargement...</p>;
  if (data.evenements.length === 0) {
    return <p className="text-slate-500">Aucune manifestation ne vous est accordée pour l&apos;instant.</p>;
  }

  const evenement = data.evenements.find((e) => e.id === evenementId) || data.evenements[0];
  const lignes = data.lignes.filter((l) => l.evenements.includes(evenement.id));
  const total = data.totaux[evenement.id];
  const realise = total.realise;
  const aValider = total.previsionnel;

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Ajoutez ici les factures (dépenses) et les recettes de votre manifestation. Chaque ligne
        est ensuite relue et validée par le bureau. Année scolaire {data.annee}.
      </p>

      {data.evenements.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {data.evenements.map((e) => (
            <button
              key={e.id}
              onClick={() => setEvenementId(e.id)}
              className={`px-4 py-1.5 text-sm rounded-full border ${
                e.id === evenement.id
                  ? "border-sou-blue bg-sou-blue text-white"
                  : "border-slate-200 text-slate-600 hover:border-sou-blue"
              }`}
            >
              {e.nom}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Dépenses validées</p>
          <p className="text-2xl font-bold text-sou-blue mt-1">{euros(realise.depense_cents)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Recettes validées</p>
          <p className="text-2xl font-bold text-sou-blue mt-1">{euros(realise.recette_cents)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">En attente de validation</p>
          <p className="text-sm text-slate-600 mt-2">
            {euros(aValider.depense_cents)} de dépenses, {euros(aValider.recette_cents)} de recettes
          </p>
        </div>
      </div>

      <FormulaireLigne token={token} evenements={data.evenements} evenementId={evenement.id} onDone={charger} />

      <div className="border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Date</th>
              <th className="text-left px-4 py-3 font-semibold">Libellé</th>
              <th className="text-left px-4 py-3 font-semibold">État</th>
              <th className="text-right px-4 py-3 font-semibold">Montant</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <LigneCompta key={l.id} ligne={l} token={token} onDone={charger} />
            ))}
            {lignes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Aucune ligne pour cette manifestation.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LigneCompta({ ligne, token, onDone }) {
  const [busy, setBusy] = useState(false);
  const statut = STATUTS[ligne.statut] || STATUTS.a_verifier;

  async function voirJustificatif() {
    const res = await fetch(`/api/admin/compta-evenement/${ligne.id}/fichier`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await res.json();
    if (res.ok && d.url) window.open(d.url, "_blank");
    else alert(d.error || "Justificatif introuvable.");
  }

  async function supprimer() {
    if (!confirm("Supprimer cette ligne ?")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/compta-evenement/${ligne.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setBusy(false);
    if (res.ok) onDone();
    else alert((await res.json().catch(() => ({}))).error || "Suppression impossible.");
  }

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-2 whitespace-nowrap">
        {ligne.date_operation ? new Date(ligne.date_operation).toLocaleDateString("fr-FR") : "—"}
      </td>
      <td className="px-4 py-2">
        <p className="font-medium text-slate-700">{ligne.libelle}</p>
        <p className="text-xs text-slate-400">
          {ligne.fournisseur}
          {ligne.sens === "recette" ? " · recette" : ""}
          {ligne.avanceParMoi ? " · avancé par vous, à rembourser" : ""}
          {ligne.partagee ? " · dépense partagée avec une autre manifestation" : ""}
        </p>
        {ligne.mienne && <p className="text-xs text-slate-400">Saisie par vous</p>}
      </td>
      <td className="px-4 py-2">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statut.classe}`}>
          {statut.label}
        </span>
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        {ligne.sens === "recette" ? "+" : "−"} {euros(ligne.montant_cents)}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        {ligne.a_justificatif && (
          <button onClick={voirJustificatif} className="text-xs font-semibold text-sou-blue hover:text-sou-gold mr-3">
            Justificatif
          </button>
        )}
        {ligne.modifiable && (
          <button onClick={supprimer} disabled={busy} className="text-xs text-red-600 disabled:opacity-40">
            Supprimer
          </button>
        )}
      </td>
    </tr>
  );
}

function FormulaireLigne({ token, evenements, evenementId, onDone }) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const [sens, setSens] = useState("depense");
  const [libelle, setLibelle] = useState("");
  const [fournisseur, setFournisseur] = useState("");
  const [montant, setMontant] = useState("");
  const [dateOperation, setDateOperation] = useState(aujourdhui);
  const [payePar, setPayePar] = useState("sou");
  const [note, setNote] = useState("");
  const [fichier, setFichier] = useState(null);
  const [typeFichier, setTypeFichier] = useState("facture_definitive");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [succes, setSucces] = useState("");

  async function envoyer(ignorerDoublon = false) {
    setBusy(true);
    setError("");
    setSucces("");

    let justificatifDataUrl = null;
    if (fichier) {
      if (fichier.size > TAILLE_MAX_OCTETS) {
        setError("Fichier trop lourd (4 Mo maximum). Prenez la photo en qualité moyenne ou envoyez un PDF.");
        setBusy(false);
        return;
      }
      try {
        justificatifDataUrl = await lireFichier(fichier);
      } catch {
        setError("Lecture du fichier impossible.");
        setBusy(false);
        return;
      }
    }

    const res = await fetch("/api/admin/compta-evenement", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        sens,
        evenementId,
        libelle,
        fournisseur,
        montant,
        dateOperation: dateOperation || null,
        payePar: sens === "depense" ? payePar : "sou",
        note,
        justificatifDataUrl,
        justificatifType: typeFichier,
        ignorerDoublon,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);

    if (res.status === 409 && d.doublonPossible) {
      if (confirm(`${d.message}\n\nL'enregistrer quand même ?`)) envoyer(true);
      return;
    }
    if (!res.ok) {
      setError(d.error || "Une erreur est survenue.");
      return;
    }
    setSucces("Ligne enregistrée : elle sera validée par le bureau.");
    setLibelle("");
    setFournisseur("");
    setMontant("");
    setNote("");
    setFichier(null);
    onDone();
  }

  const nomEvt = evenements.find((e) => e.id === evenementId)?.nom;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        envoyer();
      }}
      className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
    >
      <h3 className="font-semibold text-sou-blue">Ajouter une ligne pour « {nomEvt} »</h3>

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={sens === "depense"} onChange={() => setSens("depense")} />
          Dépense (facture)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={sens === "recette"} onChange={() => setSens("recette")} />
          Recette
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          required
          placeholder="Libellé (ex. Achat des boissons)"
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          required
          placeholder={sens === "recette" ? "Origine de la recette" : "Fournisseur (ex. Metro)"}
          value={fournisseur}
          onChange={(e) => setFournisseur(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          required
          inputMode="decimal"
          placeholder="Montant TTC en €"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={dateOperation}
          onChange={(e) => setDateOperation(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {sens === "depense" && (
        <div className="text-sm space-y-1">
          <label className="flex items-center gap-2">
            <input type="radio" checked={payePar === "sou"} onChange={() => setPayePar("sou")} />
            Le Sou des Écoles doit régler cette facture
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={payePar === "moi"} onChange={() => setPayePar("moi")} />
            J&apos;ai avancé l&apos;argent : à me rembourser
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFichier(e.target.files?.[0] || null)}
          className="text-xs"
        />
        {fichier && (
          <select
            value={typeFichier}
            onChange={(e) => setTypeFichier(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
          >
            <option value="facture_definitive">Facture</option>
            <option value="devis">Devis (pas encore payé)</option>
          </select>
        )}
      </div>
      <p className="text-xs text-slate-400">
        Joignez la photo ou le PDF de la facture (4 Mo maximum). Un devis est compté comme prévisionnel.
      </p>

      <input
        placeholder="Note pour le bureau (facultatif)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
      />

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {succes && <p className="text-green-700 text-sm">{succes}</p>}

      <button
        type="submit"
        disabled={busy}
        className="bg-sou-blue text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-40"
      >
        {busy ? "Enregistrement..." : "Enregistrer la ligne"}
      </button>
    </form>
  );
}
