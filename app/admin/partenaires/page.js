"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "../admin-shell";

function euros(cents) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function NouveauPartenaireForm({ accessToken, onCree }) {
  const [ouvert, setOuvert] = useState(false);
  const [form, setForm] = useState({
    nom: "",
    email: "",
    contactNom: "",
    telephone: "",
    adresse: "",
    codePostal: "",
    ville: "",
    siteWeb: "",
    notes: "",
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  function maj(champ, valeur) {
    setForm((f) => ({ ...f, [champ]: valeur }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      const res = await fetch("/api/admin/partenaires", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
      setForm({
        nom: "", email: "", contactNom: "", telephone: "",
        adresse: "", codePostal: "", ville: "", siteWeb: "", notes: "",
      });
      setOuvert(false);
      onCree(data.partenaire);
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
        + Nouveau partenaire
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Nom du partenaire *</span>
          <input required value={form.nom} onChange={(e) => maj("nom", e.target.value)}
            placeholder="Ex : Nico Traiteur"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">E-mail (pour l&apos;invitation)</span>
          <input type="email" value={form.email} onChange={(e) => maj("email", e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Personne référente</span>
          <input value={form.contactNom} onChange={(e) => maj("contactNom", e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Téléphone</span>
          <input value={form.telephone} onChange={(e) => maj("telephone", e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-xs font-semibold text-slate-500">Adresse</span>
          <input value={form.adresse} onChange={(e) => maj("adresse", e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Code postal</span>
          <input value={form.codePostal} onChange={(e) => maj("codePostal", e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Ville</span>
          <input value={form.ville} onChange={(e) => maj("ville", e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-xs font-semibold text-slate-500">Site web</span>
          <input value={form.siteWeb} onChange={(e) => maj("siteWeb", e.target.value)}
            placeholder="https://..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-xs font-semibold text-slate-500">Notes internes (jamais visibles par le partenaire)</span>
          <textarea rows={2} value={form.notes} onChange={(e) => maj("notes", e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
      </div>
      <p className="text-xs text-slate-400">
        Un code PIN de comptoir est généré automatiquement. L&apos;invitation à activer l&apos;espace
        partenaire s&apos;envoie ensuite depuis la fiche du partenaire.
      </p>
      <div className="flex gap-2">
        <button type="submit" disabled={envoi}
          className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50">
          {envoi ? "Création..." : "Créer le partenaire"}
        </button>
        <button type="button" onClick={() => setOuvert(false)} className="text-sm text-slate-500 px-4 py-2">
          Annuler
        </button>
      </div>
    </form>
  );
}

function PartenairesListe({ accessToken }) {
  const [partenaires, setPartenaires] = useState([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    fetch("/api/admin/partenaires", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((data) => setPartenaires(data.partenaires || []))
      .finally(() => setChargement(false));
  }, [accessToken]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-sou-blue mb-1">Partenaires</h1>
      <p className="text-slate-500 text-sm mb-4">
        Entreprises et commerçants partenaires du Sou des Écoles. Chaque fiche regroupe les
        coordonnées, la période de partenariat, l&apos;historique des versements (saisis à la main),
        les avantages offerts aux familles et leur utilisation, et les documents partagés.
      </p>

      <div className="flex flex-wrap gap-3 mb-6 text-sm">
        <Link href="/admin/partenaires/messages" className="text-sou-blue underline">
          Messages « nouveautés » à modérer →
        </Link>
        <Link href="/admin/partenaires/niveaux" className="text-sou-blue underline">
          Niveaux et quotas →
        </Link>
      </div>

      <div className="mb-6">
        <NouveauPartenaireForm
          accessToken={accessToken}
          onCree={(p) => setPartenaires((prev) => [p, ...prev])}
        />
      </div>

      {chargement ? (
        <p className="text-slate-500 text-sm">Chargement...</p>
      ) : partenaires.length === 0 ? (
        <p className="text-slate-500 text-sm">Aucun partenaire pour le moment.</p>
      ) : (
        <div className="space-y-2">
          {partenaires.map((p) => (
            <Link
              key={p.id}
              href={`/admin/partenaires/${p.id}`}
              className="block border border-slate-200 rounded-xl p-4 hover:border-sou-blue transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">
                    {p.nom}
                    {!p.active && <span className="ml-2 text-xs text-slate-400">(désactivé)</span>}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {p.ville || "—"}
                    {" · "}
                    {p.avantages} avantage{p.avantages > 1 ? "s" : ""}
                    {" · "}
                    {euros(p.totalEncaisseCents)} encaissés
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className={`px-2 py-1 rounded-full ${p.aJour ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {p.aJour ? "Partenariat à jour" : "Hors période"}
                  </span>
                  <span className={`px-2 py-1 rounded-full ${p.compteActif ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                    {p.compteActif ? "Espace activé" : "Espace non activé"}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPartenairesPage() {
  return (
    <AdminShell title="Partenaires">
      {(accessToken) => <PartenairesListe accessToken={accessToken} />}
    </AdminShell>
  );
}
