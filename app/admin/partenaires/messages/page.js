"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "../../admin-shell";

const STATUTS = {
  brouillon: { label: "Brouillon", classe: "bg-slate-100 text-slate-500" },
  soumis: { label: "À modérer", classe: "bg-amber-50 text-amber-700" },
  valide: { label: "Validé", classe: "bg-green-50 text-green-700" },
  refuse: { label: "Refusé", classe: "bg-red-50 text-red-700" },
  publie: { label: "Publié", classe: "bg-blue-50 text-blue-700" },
};

function dateFr(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function CarteMessage({ accessToken, message, onChange }) {
  const [motif, setMotif] = useState(message.motif_refus || "");
  const [envoi, setEnvoi] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const statut = STATUTS[message.statut] || STATUTS.soumis;

  useEffect(() => {
    if (!message.image_chemin) return;
    fetch(`/api/admin/partenaire-messages/${message.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((d) => setImageUrl(d.url || null))
      .catch(() => {});
  }, [accessToken, message.id, message.image_chemin]);

  async function decider(decision) {
    if (decision === "refuse" && !motif.trim()) {
      alert("Indiquez un motif de refus.");
      return;
    }
    setEnvoi(true);
    const res = await fetch(`/api/admin/partenaire-messages/${message.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ decision, motif }),
    });
    setEnvoi(false);
    if (res.ok) onChange();
    else {
      const d = await res.json();
      alert(d.error || "Erreur.");
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-800">{message.titre}</p>
          <p className="text-xs text-slate-500">
            {message.partenaireNom} · type {message.type}
            {message.mois_cible ? ` · parution ${message.mois_cible}` : ""}
            {message.soumis_le ? ` · soumis le ${dateFr(message.soumis_le)}` : ""}
          </p>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statut.classe}`}>{statut.label}</span>
      </div>

      <p className="text-sm text-slate-700 whitespace-pre-wrap mt-3">{message.texte}</p>
      {message.lien && (
        <p className="text-sm mt-2">
          Lien : <a href={message.lien} target="_blank" rel="noopener noreferrer" className="text-sou-blue underline break-all">{message.lien}</a>
        </p>
      )}
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="mt-3 max-h-48 rounded-lg border border-slate-200" />
      )}

      {message.statut === "refuse" && message.motif_refus && (
        <p className="text-xs text-red-600 mt-2">Motif du refus : {message.motif_refus}</p>
      )}

      {["soumis", "valide", "refuse"].includes(message.statut) && (
        <div className="mt-3 space-y-2">
          <textarea
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Motif (obligatoire pour un refus)"
            rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            {message.statut !== "valide" && (
              <button disabled={envoi} onClick={() => decider("valide")}
                className="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50">
                Valider
              </button>
            )}
            {message.statut !== "refuse" && (
              <button disabled={envoi} onClick={() => decider("refuse")}
                className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50">
                Refuser
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MessagesAdmin({ accessToken }) {
  const [messages, setMessages] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState("soumis");

  const recharger = useCallback(() => {
    setChargement(true);
    return fetch(`/api/admin/partenaire-messages?statut=${filtre}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
      .finally(() => setChargement(false));
  }, [accessToken, filtre]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  const filtres = [
    ["soumis", "À modérer"],
    ["valide", "Validés"],
    ["refuse", "Refusés"],
    ["publie", "Publiés"],
    ["tous", "Tous"],
  ];

  return (
    <div>
      <Link href="/admin/partenaires" className="text-sm text-slate-500 underline">← Partenaires</Link>
      <h1 className="text-2xl font-bold text-sou-blue mt-3 mb-1">Messages « nouveautés » des partenaires</h1>
      <p className="text-slate-500 text-sm mb-4">
        Les messages validés d&apos;un mois alimenteront l&apos;e-mailing mensuel « Les nouveautés de
        nos partenaires » (chantier à venir). La publication effective n&apos;est pas faite ici.
      </p>

      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {filtres.map(([key, label]) => (
          <button key={key} onClick={() => setFiltre(key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              filtre === key ? "border-sou-blue text-sou-blue" : "border-transparent text-slate-500"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {chargement ? (
        <p className="text-slate-500 text-sm">Chargement...</p>
      ) : messages.length === 0 ? (
        <p className="text-slate-500 text-sm">Aucun message.</p>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <CarteMessage key={m.id} accessToken={accessToken} message={m} onChange={recharger} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPartenaireMessagesPage() {
  return (
    <AdminShell title="Messages partenaires">
      {(accessToken) => <MessagesAdmin accessToken={accessToken} />}
    </AdminShell>
  );
}
