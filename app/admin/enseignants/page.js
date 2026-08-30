"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../admin-shell";

// ÉCHAFAUDAGE — back-office « Enseignants ».
// Cet onglet n'apparaît dans la navigation que lorsque la permission
// « enseignants » aura été ajoutée au tableau PERMISSIONS de
// app/lib/adminAuth.js ET à ONGLETS de app/admin/admin-shell.js
// (cf. docs/conception-espace-enseignants.md — points d'intégration).
// En attendant, la page se charge mais les routes renvoient 403.

const STATUTS_DEVIS = {
  soumis: { label: "Soumis", classe: "bg-amber-50 text-amber-700" },
  valide: { label: "Validé", classe: "bg-green-50 text-green-700" },
  refuse: { label: "Refusé", classe: "bg-red-50 text-red-700" },
};
const STATUTS_FACTURE = {
  soumise: { label: "Soumise", classe: "bg-amber-50 text-amber-700" },
  remboursee: { label: "Remboursée", classe: "bg-green-50 text-green-700" },
};

function euros(cents) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
function dateCourte(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function nomEnseignant(t) {
  if (!t) return "—";
  return `${t.first_name || ""} ${t.last_name || ""}`.trim() || t.email || "—";
}

async function ouvrirFichier(token, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "Impossible d'ouvrir ce fichier.");
    return;
  }
  window.open(data.url, "_blank", "noopener,noreferrer");
}

function Classes({ classes }) {
  if (!classes?.length) {
    return <span className="text-xs text-red-500">aucune classe indiquée</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {classes.map((c) => (
        <span key={c} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
          {c}
        </span>
      ))}
    </div>
  );
}

function CarteDevis({ devis, token, onChange }) {
  const [note, setNote] = useState(devis.admin_note || "");
  const [envoi, setEnvoi] = useState(false);
  const statut = STATUTS_DEVIS[devis.status] || STATUTS_DEVIS.soumis;

  async function patch(payload) {
    setEnvoi(true);
    const res = await fetch(`/api/admin/enseignants/devis/${devis.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    setEnvoi(false);
    if (res.ok) onChange();
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-800">{devis.title}</p>
          <p className="text-sm text-slate-500">{nomEnseignant(devis.teacher)}</p>
          {devis.description && <p className="text-sm text-slate-500 italic">{devis.description}</p>}
          <div className="mt-1">
            <Classes classes={devis.classes} />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Déposé le {dateCourte(devis.created_at)} — {devis.school_year}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-slate-800">{euros(devis.amount_cents)}</p>
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statut.classe}`}>
            {statut.label}
          </span>
        </div>
      </div>

      <div className="mt-3 text-sm">
        <button
          onClick={() => ouvrirFichier(token, `/api/admin/enseignants/devis/${devis.id}/fichier`)}
          className="text-sou-blue underline"
        >
          Voir le devis
        </button>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => patch({ adminNote: note })}
        placeholder="Note interne (facultatif)"
        rows={2}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-3"
      />

      <div className="flex flex-wrap gap-2 mt-3">
        {devis.status !== "valide" && (
          <button
            disabled={envoi}
            onClick={() => patch({ status: "valide", adminNote: note })}
            className="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50"
          >
            Valider
          </button>
        )}
        {devis.status !== "refuse" && (
          <button
            disabled={envoi}
            onClick={() => patch({ status: "refuse", adminNote: note })}
            className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50"
          >
            Refuser
          </button>
        )}
        {devis.status !== "soumis" && (
          <button
            disabled={envoi}
            onClick={() => patch({ status: "soumis", adminNote: note })}
            className="border border-slate-300 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50"
          >
            Remettre en attente
          </button>
        )}
      </div>
    </div>
  );
}

function CarteFacture({ facture, token, onChange }) {
  const [note, setNote] = useState(facture.admin_note || "");
  const [envoi, setEnvoi] = useState(false);
  const statut = STATUTS_FACTURE[facture.status] || STATUTS_FACTURE.soumise;

  async function patch(payload) {
    setEnvoi(true);
    const res = await fetch(`/api/admin/enseignants/factures/${facture.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    setEnvoi(false);
    if (res.ok) onChange();
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-800">{facture.label}</p>
          <p className="text-sm text-slate-500">
            {nomEnseignant(facture.teacher)}
            {facture.supplier_name ? ` — ${facture.supplier_name}` : ""}
          </p>
          <div className="mt-1">
            <Classes classes={facture.classes} />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Déposée le {dateCourte(facture.created_at)} — {facture.school_year}
            {facture.quote_id ? " — rattachée à un devis" : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-slate-800">{euros(facture.amount_cents)}</p>
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statut.classe}`}>
            {statut.label}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-3 text-sm">
        <button
          onClick={() =>
            ouvrirFichier(token, `/api/admin/enseignants/factures/${facture.id}/fichier?type=facture`)
          }
          className="text-sou-blue underline"
        >
          Voir la facture
        </button>
        {facture.rib_consultable ? (
          <button
            onClick={() =>
              ouvrirFichier(token, `/api/admin/enseignants/factures/${facture.id}/fichier?type=rib`)
            }
            className="text-sou-blue underline"
          >
            Voir le RIB
          </button>
        ) : facture.a_rib ? (
          <span className="text-xs text-slate-400">RIB reçu — supprimé après remboursement</span>
        ) : (
          <span className="text-xs text-red-500">RIB manquant</span>
        )}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => patch({ adminNote: note })}
        placeholder="Note interne (facultatif)"
        rows={2}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-3"
      />

      <div className="flex flex-wrap gap-2 mt-3">
        {facture.status !== "remboursee" && (
          <button
            disabled={envoi}
            onClick={() => patch({ status: "remboursee", adminNote: note })}
            className="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50"
          >
            Marquer remboursée
          </button>
        )}
        {facture.status !== "soumise" && (
          <button
            disabled={envoi}
            onClick={() => patch({ status: "soumise", adminNote: note })}
            className="border border-slate-300 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50"
          >
            Remettre en attente
          </button>
        )}
      </div>
    </div>
  );
}

function OngletDevis({ token }) {
  const [devis, setDevis] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState("soumis");

  const recharger = useCallback(() => {
    fetch("/api/admin/enseignants/devis", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setDevis(d.devis || []))
      .finally(() => setChargement(false));
  }, [token]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  const visibles = filtre === "soumis" ? devis.filter((d) => d.status === "soumis") : devis;

  return (
    <div>
      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {[
          { key: "soumis", label: `À traiter (${devis.filter((d) => d.status === "soumis").length})` },
          { key: "tous", label: `Tous (${devis.length})` },
        ].map((f) => (
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
        <p className="text-slate-500 text-sm">Aucun devis.</p>
      ) : (
        <div className="space-y-3">
          {visibles.map((d) => (
            <CarteDevis key={d.id} devis={d} token={token} onChange={recharger} />
          ))}
        </div>
      )}
    </div>
  );
}

function OngletFactures({ token }) {
  const [factures, setFactures] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState("soumise");

  const recharger = useCallback(() => {
    fetch("/api/admin/enseignants/factures", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setFactures(d.factures || []))
      .finally(() => setChargement(false));
  }, [token]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  const visibles =
    filtre === "soumise" ? factures.filter((f) => f.status === "soumise") : factures;

  return (
    <div>
      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {[
          {
            key: "soumise",
            label: `À rembourser (${factures.filter((f) => f.status === "soumise").length})`,
          },
          { key: "toutes", label: `Toutes (${factures.length})` },
        ].map((f) => (
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
        <p className="text-slate-500 text-sm">Aucune facture.</p>
      ) : (
        <div className="space-y-3">
          {visibles.map((f) => (
            <CarteFacture key={f.id} facture={f} token={token} onChange={recharger} />
          ))}
        </div>
      )}
    </div>
  );
}

function OngletRibs({ token }) {
  const [ribs, setRibs] = useState([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    fetch("/api/admin/enseignants/rib", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setRibs(d.ribs || []))
      .finally(() => setChargement(false));
  }, [token]);

  if (chargement) return <p className="text-slate-500 text-sm">Chargement...</p>;
  if (ribs.length === 0) return <p className="text-slate-500 text-sm">Aucun RIB déposé.</p>;

  return (
    <ul className="divide-y divide-slate-100">
      {ribs.map((r) => (
        <li key={r.id} className="py-3 flex justify-between items-center gap-4 text-sm">
          <div>
            <p className="text-slate-700">{r.label || "RIB"}</p>
            <p className="text-slate-400 text-xs">
              {nomEnseignant(r.teacher)} — {dateCourte(r.created_at)}
            </p>
          </div>
          {r.purged_at ? (
            <span className="text-slate-400 text-xs shrink-0">
              supprimé le {dateCourte(r.purged_at)} (après remboursement)
            </span>
          ) : (
            <button
              onClick={() => ouvrirFichier(token, `/api/admin/enseignants/rib/${r.id}/fichier`)}
              className="text-sou-blue underline shrink-0"
            >
              Voir le RIB
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function OngletComptes({ token }) {
  const [comptes, setComptes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("enseignant");
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState("");

  const recharger = useCallback(() => {
    fetch("/api/admin/enseignants/comptes", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setComptes(d.comptes || []))
      .finally(() => setChargement(false));
  }, [token]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  async function inviter(e) {
    e.preventDefault();
    setEnvoi(true);
    setMessage("");
    const res = await fetch("/api/admin/enseignants/comptes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ firstName, lastName, email, role }),
    });
    const data = await res.json();
    setEnvoi(false);
    setMessage(
      res.ok ? data.message || "Invitation envoyée." : data.error || "Échec de l'envoi."
    );
    if (res.ok) {
      setFirstName("");
      setLastName("");
      setEmail("");
      recharger();
    }
  }

  async function patch(id, payload) {
    await fetch("/api/admin/enseignants/comptes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, ...payload }),
    });
    recharger();
  }

  return (
    <div>
      <form onSubmit={inviter} className="border border-slate-200 rounded-xl p-4 mb-6 space-y-3">
        <p className="font-medium text-slate-700 text-sm">Inviter un enseignant / la direction</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Prénom"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Nom"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Adresse e-mail"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="enseignant">Enseignant·e</option>
            <option value="direction">Direction</option>
          </select>
        </div>
        {message && <p className="text-sm text-slate-600">{message}</p>}
        <button
          type="submit"
          disabled={envoi}
          className="bg-sou-blue text-white text-sm font-semibold px-5 py-2 rounded-full disabled:opacity-50"
        >
          {envoi ? "Envoi..." : "Envoyer l'invitation"}
        </button>
      </form>

      {chargement ? (
        <p className="text-slate-500 text-sm">Chargement...</p>
      ) : comptes.length === 0 ? (
        <p className="text-slate-500 text-sm">Aucun compte enseignant pour le moment.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {comptes.map((c) => (
            <li key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <p className="text-slate-800">
                  {c.firstName} {c.lastName}{" "}
                  <span className="text-slate-400">
                    — {c.role === "direction" ? "Direction" : "Enseignant·e"}
                  </span>
                </p>
                <p className="text-slate-500 text-xs">{c.email}</p>
                <p className="text-xs mt-0.5">
                  {c.compteActive ? (
                    <span className="text-green-700">compte activé</span>
                  ) : (
                    <span className="text-amber-600">invitation en attente</span>
                  )}
                  {!c.active && <span className="text-red-600"> — désactivé</span>}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() =>
                    patch(c.id, { role: c.role === "direction" ? "enseignant" : "direction" })
                  }
                  className="border border-slate-300 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-full"
                >
                  Basculer rôle
                </button>
                <button
                  onClick={() => patch(c.id, { active: !c.active })}
                  className="border border-slate-300 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-full"
                >
                  {c.active ? "Désactiver" : "Réactiver"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({ label, montant, sousLabel }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-sou-blue mt-1">{euros(montant)}</p>
      {sousLabel && <p className="text-xs text-slate-400 mt-0.5">{sousLabel}</p>}
    </div>
  );
}

function OngletBilan({ token }) {
  const [bilan, setBilan] = useState(null);
  const [annee, setAnnee] = useState("");
  const [chargement, setChargement] = useState(true);

  const recharger = useCallback(
    (an) => {
      setChargement(true);
      const qs = an ? `?annee=${encodeURIComponent(an)}` : "";
      fetch(`/api/admin/enseignants/bilan${qs}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => {
          setBilan(d);
          if (d.annee) setAnnee(d.annee);
        })
        .finally(() => setChargement(false));
    },
    [token]
  );

  useEffect(() => {
    recharger();
  }, [recharger]);

  if (chargement && !bilan) return <p className="text-slate-500 text-sm">Chargement...</p>;
  if (!bilan || bilan.error) {
    return <p className="text-slate-500 text-sm">{bilan?.error || "Bilan indisponible."}</p>;
  }

  const t = bilan.totaux;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <label className="text-sm text-slate-600">Année scolaire</label>
        <select
          value={annee}
          onChange={(e) => {
            setAnnee(e.target.value);
            recharger(e.target.value);
          }}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
        >
          {(bilan.annees || [annee]).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <StatCard
          label="Engagé cette année"
          montant={t.engage_cents}
          sousLabel="devis validés + factures"
        />
        <StatCard
          label="Devis validés"
          montant={t.devis_valides.total_cents}
          sousLabel={`${t.devis_valides.count} devis`}
        />
        <StatCard
          label="Factures remboursées"
          montant={t.factures_remboursees.total_cents}
          sousLabel={`${t.factures_remboursees.count} sur ${t.factures_toutes.count}`}
        />
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        <StatCard
          label="Devis en attente"
          montant={t.devis_soumis.total_cents}
          sousLabel={`${t.devis_soumis.count} à traiter`}
        />
        <StatCard
          label="Factures en attente"
          montant={t.factures_en_attente.total_cents}
          sousLabel={`${t.factures_en_attente.count} à rembourser`}
        />
        <StatCard
          label="Total factures"
          montant={t.factures_toutes.total_cents}
          sousLabel={`${t.factures_toutes.count} factures`}
        />
      </div>

      <h3 className="font-semibold text-slate-700 mb-1">Financement par classe</h3>
      <p className="text-xs text-slate-400 mb-3">
        Le montant entier d&apos;un devis ou d&apos;une facture est compté pour chaque classe
        concernée : les lignes peuvent se recouper (un car partagé compte pour chaque classe).
      </p>
      {bilan.classes.length === 0 ? (
        <p className="text-slate-500 text-sm">
          Aucune classe rattachée à un devis ou une facture cette année.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-4">Classe</th>
                <th className="py-2 pr-4">Devis validés</th>
                <th className="py-2 pr-4">Factures</th>
                <th className="py-2">Total classe</th>
              </tr>
            </thead>
            <tbody>
              {bilan.classes.map((c) => (
                <tr key={c.classe} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-medium text-slate-700">{c.classe}</td>
                  <td className="py-2 pr-4">
                    {euros(c.devis_valides_cents)}{" "}
                    <span className="text-slate-400 text-xs">({c.devis_valides_count})</span>
                  </td>
                  <td className="py-2 pr-4">
                    {euros(c.factures_cents)}{" "}
                    <span className="text-slate-400 text-xs">({c.factures_count})</span>
                  </td>
                  <td className="py-2 font-semibold text-slate-800">
                    {euros(c.devis_valides_cents + c.factures_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EnseignantsAdmin({ accessToken }) {
  const [onglet, setOnglet] = useState("bilan");
  const onglets = [
    { key: "bilan", label: "Bilan" },
    { key: "devis", label: "Devis" },
    { key: "factures", label: "Factures" },
    { key: "ribs", label: "RIB" },
    { key: "comptes", label: "Comptes" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-sou-blue mb-1">Enseignants</h1>
      <p className="text-slate-500 text-sm mb-6">
        Devis à valider, factures de prestataires à rembourser, RIB, et comptes de connexion des
        enseignants et de la direction. Les virements restent manuels : ces pages ne font que suivre
        les statuts.
      </p>

      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {onglets.map((o) => (
          <button
            key={o.key}
            onClick={() => setOnglet(o.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              onglet === o.key
                ? "border-sou-blue text-sou-blue"
                : "border-transparent text-slate-500 hover:text-sou-blue"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {onglet === "bilan" && <OngletBilan token={accessToken} />}
      {onglet === "devis" && <OngletDevis token={accessToken} />}
      {onglet === "factures" && <OngletFactures token={accessToken} />}
      {onglet === "ribs" && <OngletRibs token={accessToken} />}
      {onglet === "comptes" && <OngletComptes token={accessToken} />}
    </div>
  );
}

export default function AdminEnseignantsPage() {
  return (
    <AdminShell title="Enseignants">
      {(accessToken) => <EnseignantsAdmin accessToken={accessToken} />}
    </AdminShell>
  );
}
