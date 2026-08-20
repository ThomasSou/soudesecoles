"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "../admin-shell";

export default function AdminAccesPage() {
  return (
    <AdminShell title="Accès au back-office">
      {(token, parent) => <GestionAcces token={token} moi={parent} />}
    </AdminShell>
  );
}

function GestionAcces({ token, moi }) {
  const [membres, setMembres] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recherche, setRecherche] = useState("");

  const charger = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/admin/membres", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setMembres(data.membres || []);
    setPermissions(data.permissions || []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    charger();
  }, [charger]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return membres;
    return membres.filter((m) =>
      `${m.firstName || ""} ${m.lastName || ""} ${m.email || ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [membres, recherche]);

  if (loading) {
    return <p className="text-slate-500">Chargement...</p>;
  }

  return (
    <div>
      <p className="text-sm text-slate-500 mb-6">
        Accordez l&apos;accès au back-office et les droits précis de chaque
        personne, un par un. Ces droits peuvent être retirés à tout moment.
      </p>

      <input
        type="text"
        placeholder="Rechercher un parent par nom ou e-mail..."
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-6"
      />

      <div className="space-y-3">
        {visibles.map((m) => (
          <LigneMembre
            key={m.id}
            membre={m}
            permissions={permissions}
            moi={moi}
            token={token}
            onDone={charger}
          />
        ))}
        {visibles.length === 0 && (
          <p className="text-slate-400 italic">Aucun parent ne correspond à cette recherche.</p>
        )}
      </div>
    </div>
  );
}

function LigneMembre({ membre, permissions, moi, token, onDone }) {
  const [ouvert, setOuvert] = useState(false);
  const [isAdmin, setIsAdmin] = useState(membre.isAdmin);
  const [title, setTitle] = useState(membre.title || "");
  const [perms, setPerms] = useState(membre.permissions || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const soiMeme = membre.id === moi?.id;
  const modifie =
    isAdmin !== membre.isAdmin ||
    title !== (membre.title || "") ||
    JSON.stringify(perms) !== JSON.stringify(membre.permissions || {});

  async function enregistrer() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/membres", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ parentId: membre.id, isAdmin, permissions: perms, title }),
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
    <div className="border border-slate-200 rounded-xl p-4">
      <button
        onClick={() => setOuvert((v) => !v)}
        className="w-full flex flex-wrap items-center justify-between gap-2 text-left"
      >
        <div>
          <p className="font-semibold text-sou-blue">
            {membre.firstName} {membre.lastName}
            {soiMeme && <span className="text-slate-400 text-xs font-normal ml-2">(vous)</span>}
          </p>
          <p className="text-sm text-slate-500">
            {membre.email}
            {membre.title ? ` — ${membre.title}` : ""}
          </p>
        </div>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${
            membre.isAdmin ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {membre.isAdmin ? "Accès back-office" : "Pas d'accès"}
        </span>
      </button>

      {ouvert && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              disabled={soiMeme}
            />
            Accès au back-office
          </label>

          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Fonction (affichée dans le back-office, ex. Présidente, Trésorier)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex : Présidente"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full sm:w-80"
            />
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-2">Droits accordés</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {permissions.map((p) => (
                <label key={p.key} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={Boolean(perms[p.key])}
                    disabled={!isAdmin || (soiMeme && p.key === "acces")}
                    onChange={(e) =>
                      setPerms((prev) => ({ ...prev, [p.key]: e.target.checked }))
                    }
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            onClick={enregistrer}
            disabled={busy || !modifie}
            className="bg-sou-blue text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-40"
          >
            {busy ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      )}
    </div>
  );
}
