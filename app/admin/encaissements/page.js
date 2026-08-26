"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminShell from "../admin-shell";

function formatMontant(cents) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function formatHeure(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUTS = {
  paid: { label: "Payé", classe: "bg-green-50 text-green-700" },
  pending: { label: "En attente", classe: "bg-amber-50 text-amber-700" },
  failed: { label: "Échoué", classe: "bg-red-50 text-red-700" },
};

function NouvelEncaissementForm({ accessToken }) {
  const [nom, setNom] = useState("");
  const [motif, setMotif] = useState("");
  const [montant, setMontant] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      const res = await fetch("/api/admin/encaissements", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ nom, motif, montant }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
      // HelloAsso refuse d'être affiché en iframe : redirection pleine page,
      // comme pour la boutique et les cotisations.
      window.location.href = data.redirectUrl;
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <h2 className="font-semibold text-slate-800">Nouvel encaissement</h2>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <div>
        <label className="text-xs font-semibold text-slate-500">Payer</label>
        <input
          required
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Nom de la personne qui règle"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500">Motif du paiement</label>
        <input
          required
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Ex : Rachat des invendus de la Foire 2026"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500">Montant</label>
        <div className="relative w-32">
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            className="w-full border border-slate-300 rounded-lg pl-3 pr-7 py-2 text-sm"
          />
          <span className="absolute inset-y-0 right-3 flex items-center text-slate-400 text-sm">€</span>
        </div>
      </div>
      <button
        type="submit"
        disabled={envoi}
        className="bg-sou-blue text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-50"
      >
        {envoi ? "Redirection..." : "Créer le paiement"}
      </button>
    </form>
  );
}

function EncaissementsAdmin({ accessToken }) {
  const searchParams = useSearchParams();
  const [encaissements, setEncaissements] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [banniere, setBanniere] = useState(null); // { type: 'succes'|'erreur', texte }

  async function recharger() {
    const res = await fetch("/api/admin/encaissements", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (res.ok) setEncaissements(data.encaissements || []);
    setChargement(false);
  }

  useEffect(() => {
    const id = searchParams.get("id");
    const statut = searchParams.get("statut");

    async function verifierRetour() {
      if (!id) {
        await recharger();
        return;
      }
      const res = await fetch(`/api/admin/encaissements/${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (res.ok && data.encaissement?.status === "paid") {
        setBanniere({
          type: "succes",
          texte: `Paiement de ${formatMontant(data.encaissement.montant_cents)} enregistré pour ${data.encaissement.nom}.`,
        });
      } else if (statut === "erreur") {
        setBanniere({ type: "erreur", texte: "Le paiement a été annulé ou a échoué." });
      } else {
        setBanniere({
          type: "erreur",
          texte: "Paiement non confirmé pour le moment. Il apparaîtra dans la liste dès sa validation.",
        });
      }
      window.history.replaceState(null, "", "/admin/encaissements");
      await recharger();
    }

    verifierRetour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-sou-blue mb-1">Encaissements libres</h1>
      <p className="text-slate-500 text-sm mb-6">
        Pour tout paiement ponctuel hors boutique et cotisation (ex : remboursement personnel après
        une manifestation), encaissé par carte via HelloAsso plutôt que par un terminal à commission.
      </p>

      {banniere && (
        <div
          className={`mb-6 rounded-xl p-4 text-sm ${
            banniere.type === "succes" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {banniere.texte}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        <NouvelEncaissementForm accessToken={accessToken} />

        <div>
          <h2 className="font-semibold text-slate-800 mb-3">Historique</h2>
          {chargement ? (
            <p className="text-slate-500 text-sm">Chargement...</p>
          ) : encaissements.length === 0 ? (
            <p className="text-slate-500 text-sm">Aucun encaissement pour le moment.</p>
          ) : (
            <div className="space-y-2">
              {encaissements.map((enc) => {
                const statut = STATUTS[enc.status] || STATUTS.pending;
                return (
                  <div key={enc.id} className="border border-slate-200 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-800">{enc.nom}</p>
                        <p className="text-sm text-slate-500">{enc.motif}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {formatHeure(enc.paid_at || enc.created_at)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-slate-800">{formatMontant(enc.montant_cents)}</p>
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statut.classe}`}>
                          {statut.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminEncaissementsPage() {
  return (
    <AdminShell title="Encaissements libres">
      {(accessToken) => (
        <Suspense fallback={null}>
          <EncaissementsAdmin accessToken={accessToken} />
        </Suspense>
      )}
    </AdminShell>
  );
}
