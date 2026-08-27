"use client";

import { useEffect, useState } from "react";
import AdminShell from "../admin-shell";

const CATEGORIES = {
  manifestation: "Manifestation",
  investissement: "Investissement général",
  fonctionnement: "Frais de fonctionnement",
  autre: "Autre",
};

const STATUTS = {
  pending: { label: "En attente", classe: "bg-amber-50 text-amber-700" },
  reimbursed: { label: "Remboursé", classe: "bg-green-50 text-green-700" },
  refused: { label: "Refusé", classe: "bg-red-50 text-red-700" },
};

function formatMontant(cents) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function libelle(demande) {
  if (demande.category === "manifestation") return demande.event_name || "Manifestation";
  return CATEGORIES[demande.category] || demande.category;
}

async function ouvrirFichier(accessToken, id, type) {
  const res = await fetch(`/api/admin/remboursements/${id}/fichier?type=${type}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "Impossible d'ouvrir ce fichier.");
    return;
  }
  window.open(data.url, "_blank", "noopener,noreferrer");
}

function DemandeCard({ demande, accessToken, onChange }) {
  const [note, setNote] = useState(demande.admin_note || "");
  const [envoi, setEnvoi] = useState(false);
  const statut = STATUTS[demande.status] || STATUTS.pending;

  async function changerStatut(status) {
    setEnvoi(true);
    const res = await fetch(`/api/admin/remboursements/${demande.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ status, adminNote: note }),
    });
    setEnvoi(false);
    if (res.ok) onChange();
  }

  async function enregistrerNote() {
    setEnvoi(true);
    const res = await fetch(`/api/admin/remboursements/${demande.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ adminNote: note }),
    });
    setEnvoi(false);
    if (res.ok) onChange();
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-800">
            {demande.parent ? `${demande.parent.first_name} ${demande.parent.last_name}` : "—"}
          </p>
          <p className="text-sm text-slate-500">{libelle(demande)}</p>
          {demande.description && <p className="text-sm text-slate-500 italic">{demande.description}</p>}
          <p className="text-xs text-slate-400 mt-1">Déposée le {formatDate(demande.created_at)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-slate-800">{formatMontant(demande.amount_cents)}</p>
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statut.classe}`}>{statut.label}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-3 text-sm">
        <button
          onClick={() => ouvrirFichier(accessToken, demande.id, "facture")}
          className="text-sou-blue underline"
        >
          Voir la facture
        </button>
        {demande.rib_path && (
          <button
            onClick={() => ouvrirFichier(accessToken, demande.id, "rib")}
            className="text-sou-blue underline"
          >
            Voir le RIB
          </button>
        )}
      </div>

      <div className="mt-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={enregistrerNote}
          placeholder="Note interne (facultatif)"
          rows={2}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {demande.status !== "reimbursed" && (
          <button
            disabled={envoi}
            onClick={() => changerStatut("reimbursed")}
            className="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50"
          >
            Marquer remboursé
          </button>
        )}
        {demande.status !== "refused" && (
          <button
            disabled={envoi}
            onClick={() => changerStatut("refused")}
            className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50"
          >
            Refuser
          </button>
        )}
        {demande.status !== "pending" && (
          <button
            disabled={envoi}
            onClick={() => changerStatut("pending")}
            className="border border-slate-300 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50"
          >
            Remettre en attente
          </button>
        )}
      </div>
    </div>
  );
}

function RemboursementsAdmin({ accessToken }) {
  const [demandes, setDemandes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState("pending");

  function recharger() {
    fetch("/api/admin/remboursements", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((data) => setDemandes(data.demandes || []))
      .finally(() => setChargement(false));
  }

  useEffect(() => {
    recharger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const filtres = [
    { key: "pending", label: `En attente (${demandes.filter((d) => d.status === "pending").length})` },
    { key: "toutes", label: `Toutes (${demandes.length})` },
  ];
  const visibles = filtre === "pending" ? demandes.filter((d) => d.status === "pending") : demandes;

  return (
    <div>
      <h1 className="text-2xl font-bold text-sou-blue mb-1">Demandes de remboursement</h1>
      <p className="text-slate-500 text-sm mb-6">
        Frais engagés par les parents (manifestation, investissement général, frais de fonctionnement,
        ou autre) à rembourser par virement — cette page suit le statut de chaque demande, elle ne
        déclenche pas le virement.
      </p>

      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {filtres.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltre(f.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              filtre === f.key ? "border-sou-blue text-sou-blue" : "border-transparent text-slate-500"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {chargement ? (
        <p className="text-slate-500 text-sm">Chargement...</p>
      ) : visibles.length === 0 ? (
        <p className="text-slate-500 text-sm">Aucune demande pour le moment.</p>
      ) : (
        <div className="space-y-3">
          {visibles.map((d) => (
            <DemandeCard key={d.id} demande={d} accessToken={accessToken} onChange={recharger} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminRemboursementsPage() {
  return (
    <AdminShell title="Remboursements">
      {(accessToken) => <RemboursementsAdmin accessToken={accessToken} />}
    </AdminShell>
  );
}
