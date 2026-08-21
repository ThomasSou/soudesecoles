"use client";

import { useEffect, useState } from "react";
import AdminShell from "../admin-shell";

function formatHeure(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NouvelAvantageForm({ accessToken, onCree }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("interne");
  const [partnerName, setPartnerName] = useState("");
  const [requiresMembership, setRequiresMembership] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [ouvert, setOuvert] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      const res = await fetch("/api/admin/avantages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ label, type, partnerName, requiresMembership }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
      setLabel("");
      setPartnerName("");
      setType("interne");
      setRequiresMembership(true);
      setOuvert(false);
      onCree(data.avantage);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="bg-sou-blue text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-sou-gold transition-colors"
      >
        + Nouvel avantage
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <div>
        <label className="text-xs font-semibold text-slate-500">Nom de l&apos;avantage</label>
        <input
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex : Boisson offerte - Foire 2026"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={type === "interne"} onChange={() => setType("interne")} />
          Interne (bureau)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={type === "partenaire"} onChange={() => setType("partenaire")} />
          Partenaire
        </label>
      </div>
      {type === "partenaire" && (
        <div>
          <label className="text-xs font-semibold text-slate-500">Nom du partenaire</label>
          <input
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={requiresMembership}
          onChange={(e) => setRequiresMembership(e.target.checked)}
        />
        Réservé aux familles à jour de cotisation
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={envoi}
          className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50"
        >
          {envoi ? "Création..." : "Créer"}
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="text-sm text-slate-500 px-4 py-2"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

function DetailUtilisations({ accessToken, avantageId, onFermer }) {
  const [chargement, setChargement] = useState(true);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    fetch(`/api/admin/avantages/${avantageId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((data) => setDetail(data))
      .finally(() => setChargement(false));
  }, [accessToken, avantageId]);

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-2">
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm font-semibold text-slate-600">Familles ayant utilisé cet avantage</p>
        <button onClick={onFermer} className="text-xs text-slate-400 underline">
          Fermer
        </button>
      </div>
      {chargement ? (
        <p className="text-sm text-slate-400">Chargement...</p>
      ) : !detail?.utilisations?.length ? (
        <p className="text-sm text-slate-400">Aucune utilisation pour le moment.</p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {detail.utilisations.map((u) => (
            <li key={u.id} className="py-2 flex justify-between text-sm">
              <span className="text-slate-700">{u.familyName}</span>
              <span className="text-slate-400 text-xs">
                {formatHeure(u.used_at)}
                {u.used_by ? ` — ${u.used_by}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LigneAvantage({ avantage, accessToken, onMaj }) {
  const [detailOuvert, setDetailOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [pinRevele, setPinRevele] = useState(false);

  async function patch(body) {
    setEnvoi(true);
    try {
      const res = await fetch(`/api/admin/avantages/${avantage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) onMaj(data.avantage);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-800">{avantage.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {avantage.type === "partenaire" ? `Partenaire${avantage.partner_name ? " — " + avantage.partner_name : ""}` : "Interne"}
            {" — "}
            {avantage.requiert_adhesion ? "réservé aux adhérents à jour" : "ouvert à tous"}
            {" — "}
            <button onClick={() => setDetailOuvert((v) => !v)} className="underline">
              {avantage.utilisations} utilisation{avantage.utilisations > 1 ? "s" : ""}
            </button>
          </p>
          {avantage.type === "partenaire" && (
            <p className="text-xs text-slate-500 mt-1">
              Code PIN partenaire :{" "}
              <button onClick={() => setPinRevele((v) => !v)} className="font-mono underline">
                {pinRevele ? avantage.pin_code : "••••"}
              </button>{" "}
              <button
                onClick={() => patch({ regeneratePin: true })}
                disabled={envoi}
                className="underline ml-2"
              >
                régénérer
              </button>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${avantage.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
            {avantage.active ? "Actif" : "Désactivé"}
          </span>
          <button
            onClick={() => patch({ active: !avantage.active })}
            disabled={envoi}
            className="text-sm text-sou-blue underline disabled:opacity-50"
          >
            {avantage.active ? "Désactiver" : "Réactiver"}
          </button>
        </div>
      </div>
      {detailOuvert && (
        <DetailUtilisations
          accessToken={accessToken}
          avantageId={avantage.id}
          onFermer={() => setDetailOuvert(false)}
        />
      )}
    </div>
  );
}

function AvantagesAdmin({ accessToken }) {
  const [avantages, setAvantages] = useState([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    fetch("/api/admin/avantages", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((data) => setAvantages(data.avantages || []))
      .finally(() => setChargement(false));
  }, [accessToken]);

  function majAvantage(maj) {
    setAvantages((prev) => prev.map((a) => (a.id === maj.id ? { ...a, ...maj } : a)));
  }

  if (chargement) return <p className="text-slate-500 text-sm">Chargement...</p>;

  return (
    <div className="space-y-4">
      <NouvelAvantageForm
        accessToken={accessToken}
        onCree={(a) => setAvantages((prev) => [{ ...a, utilisations: 0 }, ...prev])}
      />
      {avantages.length === 0 ? (
        <p className="text-slate-500 text-sm">Aucun avantage créé pour le moment.</p>
      ) : (
        <div className="space-y-3">
          {avantages.map((a) => (
            <LigneAvantage key={a.id} avantage={a} accessToken={accessToken} onMaj={majAvantage} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminAvantagesPage() {
  return (
    <AdminShell title="Avantages">
      {(accessToken) => (
        <div>
          <h1 className="text-2xl font-bold text-sou-blue mb-1">Avantages à usage limité</h1>
          <p className="text-slate-500 text-sm mb-6">
            Boisson offerte aux adhérents à jour, offres partenaires... Un avantage actif
            n&apos;est utilisable qu&apos;une fois par famille : le bouton de validation
            apparaît directement sur la page de la carte quand un membre du bureau (avec le
            droit « Avantages ») ou un partenaire connecté scanne la carte d&apos;un
            adhérent. Les partenaires se connectent avec leur code PIN sur{" "}
            <span className="font-mono">/partenaire</span>.
          </p>
          <AvantagesAdmin accessToken={accessToken} />
        </div>
      )}
    </AdminShell>
  );
}
