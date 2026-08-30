"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "../../admin-shell";

function LigneNiveau({ accessToken, niveau, onMaj }) {
  const [form, setForm] = useState({
    libelle: niveau.libelle || "",
    quota_email: niveau.quota_email ?? 0,
    quota_reseau: niveau.quota_reseau ?? 0,
    quota_avantages: niveau.quota_avantages ?? "",
    contreparties: niveau.contreparties || "",
  });
  const [envoi, setEnvoi] = useState(false);
  const [msg, setMsg] = useState("");

  function maj(champ, v) {
    setForm((f) => ({ ...f, [champ]: v }));
  }

  async function enregistrer() {
    setEnvoi(true);
    setMsg("");
    const res = await fetch("/api/admin/niveaux-partenaire", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ niveau: niveau.niveau, ...form }),
    });
    const data = await res.json();
    setEnvoi(false);
    if (res.ok) {
      onMaj(data.niveau);
      setMsg("Enregistré.");
    } else {
      setMsg(data.error || "Erreur.");
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <h3 className="font-semibold text-slate-800 mb-3">{niveau.libelle} <span className="text-xs text-slate-400">({niveau.niveau})</span></h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Libellé affiché</span>
          <input value={form.libelle} onChange={(e) => maj("libelle", e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Messages e-mail / mois</span>
          <input type="number" min="0" value={form.quota_email}
            onChange={(e) => maj("quota_email", e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Messages réseaux / mois</span>
          <input type="number" min="0" value={form.quota_reseau}
            onChange={(e) => maj("quota_reseau", e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Avantages actifs max (vide = illimité)</span>
          <input type="number" min="0" value={form.quota_avantages}
            onChange={(e) => maj("quota_avantages", e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm sm:col-span-3">
          <span className="text-xs font-semibold text-slate-500">Contreparties du niveau (texte libre)</span>
          <textarea rows={2} value={form.contreparties}
            onChange={(e) => maj("contreparties", e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button onClick={enregistrer} disabled={envoi}
          className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50">
          {envoi ? "Enregistrement..." : "Enregistrer"}
        </button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}

function NiveauxAdmin({ accessToken }) {
  const [niveaux, setNiveaux] = useState([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    fetch("/api/admin/niveaux-partenaire", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((d) => setNiveaux(d.niveaux || []))
      .finally(() => setChargement(false));
  }, [accessToken]);

  return (
    <div>
      <Link href="/admin/partenaires" className="text-sm text-slate-500 underline">← Partenaires</Link>
      <h1 className="text-2xl font-bold text-sou-blue mt-3 mb-1">Niveaux et quotas</h1>
      <p className="text-slate-500 text-sm mb-6">
        Trois niveaux fermés (Or, Argent, Bronze). Le niveau d&apos;un partenaire est celui de sa
        période de partenariat active. Ces quotas s&apos;appliquent alors à ses avantages et à ses
        messages « nouveautés » du mois.
      </p>
      {chargement ? (
        <p className="text-slate-500 text-sm">Chargement...</p>
      ) : (
        <div className="space-y-4">
          {niveaux.map((n) => (
            <LigneNiveau
              key={n.niveau}
              accessToken={accessToken}
              niveau={n}
              onMaj={(maj) => setNiveaux((prev) => prev.map((x) => (x.niveau === maj.niveau ? maj : x)))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminNiveauxPartenairePage() {
  return (
    <AdminShell title="Niveaux partenaires">
      {(accessToken) => <NiveauxAdmin accessToken={accessToken} />}
    </AdminShell>
  );
}
