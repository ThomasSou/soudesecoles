"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../admin-shell";

export default function AdminDemandesPage() {
  return (
    <AdminShell title="Demandes d'inscription">
      {(token) => <ListeDemandes token={token} />}
    </AdminShell>
  );
}

const STATUTS = {
  pending: { label: "En attente", classe: "bg-amber-50 text-amber-700" },
  approved: { label: "Validée", classe: "bg-green-50 text-green-700" },
  refused: { label: "Refusée", classe: "bg-slate-100 text-slate-500" },
};

function ListeDemandes({ token }) {
  const [demandes, setDemandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [filtre, setFiltre] = useState("pending");

  const charger = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/admin/demandes", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setDemandes(data.demandes || []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function traiter(id, action) {
    setBusyId(id);
    setError("");
    const res = await fetch("/api/admin/demandes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id, action }),
    });
    const data = await res.json();
    setBusyId(null);

    if (!res.ok) {
      setError(data.error || "Une erreur est survenue.");
      return;
    }
    charger();
  }

  if (loading) {
    return <p className="text-slate-500">Chargement des demandes...</p>;
  }

  const visibles = demandes.filter((d) =>
    filtre === "toutes" ? true : d.status === filtre
  );

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {[
          { key: "pending", label: "En attente" },
          { key: "approved", label: "Validées" },
          { key: "refused", label: "Refusées" },
          { key: "toutes", label: "Toutes" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltre(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm ${
              filtre === f.key
                ? "bg-sou-blue text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-red-600 text-sm mb-4 bg-red-50 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {visibles.length === 0 ? (
        <p className="text-slate-500">Aucune demande dans cette catégorie.</p>
      ) : (
        <div className="space-y-4">
          {visibles.map((d) => {
            const statut = STATUTS[d.status] || STATUTS.pending;
            return (
              <div key={d.id} className="border border-slate-200 rounded-xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sou-blue">
                      {d.first_name} {d.last_name}
                    </p>
                    <p className="text-sm text-slate-600">{d.email}</p>
                    {d.phone && (
                      <p className="text-sm text-slate-500">{d.phone}</p>
                    )}
                  </div>
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full ${statut.classe}`}
                  >
                    {statut.label}
                  </span>
                </div>

                {Array.isArray(d.children) && d.children.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                      Enfants déclarés
                    </p>
                    <ul className="text-sm text-slate-600 space-y-0.5">
                      {d.children.map((c, i) => (
                        <li key={i}>
                          {c.firstName} {c.lastName}
                          {c.classLevel ? ` — ${c.classLevel}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {d.message && (
                  <p className="mt-3 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                    {d.message}
                  </p>
                )}

                <p className="text-xs text-slate-400 mt-3">
                  Reçue le{" "}
                  {new Date(d.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>

                {d.status === "pending" && (
                  <div className="flex gap-3 mt-4 pt-4 border-t border-slate-100">
                    <button
                      onClick={() => traiter(d.id, "valider")}
                      disabled={busyId === d.id}
                      className="bg-sou-blue text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-60"
                    >
                      {busyId === d.id
                        ? "Traitement..."
                        : "Valider et inviter"}
                    </button>
                    <button
                      onClick={() => traiter(d.id, "refuser")}
                      disabled={busyId === d.id}
                      className="text-sm text-slate-500 hover:text-red-600 px-3 disabled:opacity-60"
                    >
                      Refuser
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
