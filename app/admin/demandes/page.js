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
  const [avis, setAvis] = useState("");
  const [filtre, setFiltre] = useState("pending");
  // Motif / message facultatif, saisi par demande avant de trancher.
  const [motifs, setMotifs] = useState({});

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
    if (
      action === "refuser" &&
      !window.confirm("Refuser cette demande et prévenir la personne par e-mail ?")
    ) {
      return;
    }
    setBusyId(id);
    setError("");
    setAvis("");
    const res = await fetch("/api/admin/demandes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id, action, message: motifs[id] || "" }),
    });
    const data = await res.json();
    setBusyId(null);

    if (!res.ok) {
      setError(data.error || "Une erreur est survenue.");
      return;
    }
    if (data.mailSent === false) {
      setAvis(
        "La demande a bien été traitée, mais l'e-mail à la personne n'a pas pu être envoyé. Prévenez-la autrement."
      );
    }
    setMotifs((prev) => {
      const copie = { ...prev };
      delete copie[id];
      return copie;
    });
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

      {avis && (
        <p className="text-amber-700 text-sm mb-4 bg-amber-50 rounded-lg px-4 py-3">
          {avis}
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
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Message à la personne (facultatif, ajouté à l&apos;e-mail
                      de décision — surtout utile en cas de refus)
                    </label>
                    <textarea
                      value={motifs[d.id] || ""}
                      onChange={(e) =>
                        setMotifs((prev) => ({
                          ...prev,
                          [d.id]: e.target.value,
                        }))
                      }
                      rows={2}
                      disabled={busyId === d.id}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 disabled:opacity-60"
                    />
                    <div className="flex gap-3">
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
                  </div>
                )}

                {d.status !== "pending" && d.decision_message && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                      Message envoyé à la personne
                    </p>
                    <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2 whitespace-pre-wrap">
                      {d.decision_message}
                    </p>
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
