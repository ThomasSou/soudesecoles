"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../admin-shell";
import { currentSchoolYear, isMembershipValid } from "../../lib/anneeScolaire";

export default function AdminFamillesPage() {
  return (
    <AdminShell title="Familles">
      {(token) => <ListeFamilles token={token} />}
    </AdminShell>
  );
}

function ListeFamilles({ token }) {
  const [familles, setFamilles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ouvert, setOuvert] = useState(null);
  const [filtre, setFiltre] = useState("toutes");

  const charger = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/admin/familles", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setFamilles(data.familles || []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    charger();
  }, [charger]);

  if (loading) {
    return <p className="text-slate-500">Chargement des familles...</p>;
  }

  const sansCompte = familles.filter((f) => f.parents.length === 0);
  const visibles =
    filtre === "sans-compte" ? sansCompte : familles;
  const annee = currentSchoolYear();

  return (
    <div>
      {sansCompte.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <p className="font-semibold text-amber-800">
            {sansCompte.length} famille{sansCompte.length > 1 ? "s" : ""} sans
            compte de connexion
          </p>
          <p className="text-sm text-amber-700 mt-1">
            Ces familles existent en base (enfants, cotisation) mais aucun
            parent ne peut se connecter : l&apos;invitation initiale n&apos;a
            pas abouti. Ajoutez un parent pour envoyer l&apos;invitation.
          </p>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {[
          { key: "toutes", label: `Toutes (${familles.length})` },
          { key: "sans-compte", label: `Sans compte (${sansCompte.length})` },
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

      <div className="space-y-4">
        {visibles.map((f) => {
          const adhesion = f.memberships.find((m) => m.school_year === annee);
          const aJour = isMembershipValid(adhesion);
          const nom =
            f.parents.length > 0
              ? f.parents
                  .map((p) => `${p.first_name || ""} ${p.last_name || ""}`.trim())
                  .join(" & ")
              : f.children.length > 0
              ? `Famille ${f.children[0].last_name}`
              : "Famille sans nom";

          return (
            <div key={f.id} className="border border-slate-200 rounded-xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-sou-blue">{nom}</p>
                  <p className="text-sm text-slate-500">
                    {f.address_line}
                    {f.address_line ? ", " : ""}
                    {f.postal_code} {f.city}
                  </p>
                </div>
                <div className="flex gap-2">
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full ${
                      aJour
                        ? "bg-green-50 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {aJour ? `À jour ${annee}` : "Non cotisant"}
                  </span>
                  {f.parents.length === 0 && (
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-700">
                      Aucun compte
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 mt-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Parents ({f.parents.length})
                  </p>
                  {f.parents.length === 0 ? (
                    <p className="text-slate-400 italic">Aucun compte créé</p>
                  ) : (
                    <ul className="text-slate-600 space-y-0.5">
                      {f.parents.map((p) => (
                        <li key={p.id}>
                          {p.first_name} {p.last_name}
                          <span className="text-slate-400"> — {p.email}</span>
                          {p.role !== "parent" && (
                            <span className="text-sou-blue text-xs ml-1">
                              ({p.role})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Enfants ({f.children.length})
                  </p>
                  <ul className="text-slate-600 space-y-0.5">
                    {f.children.map((c) => (
                      <li key={c.id}>
                        {c.first_name} {c.last_name}
                        {c.class_level ? (
                          <span className="text-slate-400"> — {c.class_level}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-4 items-center">
                <BoutonCotisation
                  famille={f}
                  annee={annee}
                  aJour={aJour}
                  token={token}
                  onDone={charger}
                />
              </div>

              <div className="mt-3">
                {ouvert === f.id ? (
                  <FormulaireParent
                    familyId={f.id}
                    token={token}
                    onDone={() => {
                      setOuvert(null);
                      charger();
                    }}
                    onCancel={() => setOuvert(null)}
                  />
                ) : (
                  <button
                    onClick={() => setOuvert(f.id)}
                    className="text-sm font-semibold text-sou-blue hover:text-sou-gold"
                  >
                    + Ajouter un parent et l&apos;inviter
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormulaireParent({ familyId, token, onDone, onCancel }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const res = await fetch("/api/admin/familles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ familyId, firstName, lastName, email, phone }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error || "Une erreur est survenue.");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          placeholder="Prénom"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          placeholder="Nom"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          required
          type="email"
          placeholder="Adresse e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          placeholder="Téléphone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="bg-sou-blue text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-60"
        >
          {busy ? "Envoi..." : "Inviter ce parent"}
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


function BoutonCotisation({ famille, annee, aJour, token, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function basculer() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/adhesions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        familyId: famille.id,
        schoolYear: annee,
        amount: aJour ? null : 20,
        paid: !aJour,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Erreur.");
      return;
    }
    onDone();
  }

  return (
    <div>
      <button
        onClick={basculer}
        disabled={busy}
        className={`text-sm font-semibold px-4 py-1.5 rounded-full transition-colors disabled:opacity-60 ${
          aJour
            ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
            : "bg-green-600 text-white hover:bg-green-700"
        }`}
      >
        {busy
          ? "..."
          : aJour
          ? `Annuler la cotisation ${annee}`
          : `Encaisser la cotisation ${annee} (20 €)`}
      </button>
      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  );
}
