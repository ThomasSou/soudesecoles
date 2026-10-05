"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "../admin-shell";
import { currentSchoolYear } from "../../lib/anneeScolaire";

const MODES = {
  helloasso: "En ligne (HelloAsso)",
  cheque: "Chèque",
  especes: "Espèces",
  sumup: "Carte bancaire (SumUp)",
};

const euros = (n) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

function Bloc({ titre, valeur, precision }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{titre}</p>
      <p className="text-2xl font-bold text-sou-blue mt-1">{valeur}</p>
      {precision && <p className="text-xs text-slate-400 mt-1">{precision}</p>}
    </div>
  );
}

export default function AdminCotisationsPage() {
  return (
    <AdminShell title="Cotisations">
      {(token) => <Cotisations token={token} />}
    </AdminShell>
  );
}

function Cotisations({ token }) {
  const [cotisations, setCotisations] = useState(null);
  const [error, setError] = useState("");
  const [annee, setAnnee] = useState(currentSchoolYear());

  useEffect(() => {
    if (!token) return;
    fetch("/api/admin/cotisations", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur.");
        setCotisations(data.cotisations);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  const annees = useMemo(() => {
    const set = new Set((cotisations || []).map((c) => c.anneeScolaire));
    set.add(currentSchoolYear());
    return [...set].sort().reverse();
  }, [cotisations]);

  const { payees, enAttente, total, parMode } = useMemo(() => {
    const deLAnnee = (cotisations || []).filter((c) => c.anneeScolaire === annee);
    const payees = deLAnnee.filter((c) => c.payeeLe);
    const enAttente = deLAnnee.filter((c) => !c.payeeLe);
    const total = payees.reduce((s, c) => s + (c.montant || 0), 0);
    const parMode = {};
    for (const c of payees) {
      const k = c.mode || "inconnu";
      parMode[k] ??= { n: 0, eur: 0 };
      parMode[k].n += 1;
      parMode[k].eur += c.montant || 0;
    }
    return { payees, enAttente, total, parMode };
  }, [cotisations, annee]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!cotisations) return <p className="text-slate-500">Chargement...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-500" htmlFor="annee">Année scolaire</label>
        <select
          id="annee"
          value={annee}
          onChange={(e) => setAnnee(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        >
          {annees.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Bloc titre="Total encaissé" valeur={euros(total)} />
        <Bloc titre="Cotisations payées" valeur={payees.length} />
        <Bloc
          titre="Montant moyen"
          valeur={payees.length ? euros(total / payees.length) : "—"}
        />
      </div>

      {Object.keys(parMode).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-semibold text-sou-blue mb-3">Par mode de paiement</h3>
          <ul className="space-y-1 text-sm">
            {Object.entries(parMode).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span className="text-slate-700">{MODES[k] || "Non précisé"}</span>
                <span className="text-slate-500">
                  {v.n} cotisation{v.n > 1 ? "s" : ""} — <strong>{euros(v.eur)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Date</th>
              <th className="text-left px-4 py-3 font-semibold">Famille</th>
              <th className="text-left px-4 py-3 font-semibold">Mode</th>
              <th className="text-right px-4 py-3 font-semibold">Montant</th>
              <th className="text-left px-4 py-3 font-semibold">Note</th>
            </tr>
          </thead>
          <tbody>
            {payees.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-2 whitespace-nowrap">
                  {new Date(c.payeeLe).toLocaleDateString("fr-FR")}
                </td>
                <td className="px-4 py-2">{c.famille}</td>
                <td className="px-4 py-2">{MODES[c.mode] || "Non précisé"}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {c.montant == null ? "—" : euros(c.montant)}
                </td>
                <td className="px-4 py-2 text-slate-500">{c.note || ""}</td>
              </tr>
            ))}
            {payees.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Aucune cotisation payée pour {annee}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {enAttente.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="font-semibold text-amber-800 mb-1">
            Paiements commencés mais non aboutis ({enAttente.length})
          </h3>
          <p className="text-xs text-amber-700 mb-3">
            Ces familles ont lancé le paiement sans le terminer : ce n&apos;est pas encore une recette.
          </p>
          <ul className="text-sm text-amber-900 space-y-0.5">
            {enAttente.map((c) => (
              <li key={c.id}>
                {c.famille}
                {c.montant != null ? ` — ${euros(c.montant)} prévus` : ""}
                {c.creeeLe ? ` (démarré le ${new Date(c.creeeLe).toLocaleDateString("fr-FR")})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
