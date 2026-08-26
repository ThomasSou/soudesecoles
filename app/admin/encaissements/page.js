"use client";

import { useEffect, useState } from "react";
import AdminShell from "../admin-shell";

function formatMontant(cents) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function formatHeure(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUTS = {
  paid: { label: "Payé", classe: "bg-green-50 text-green-700" },
  pending: { label: "En attente", classe: "bg-amber-50 text-amber-700" },
  failed: { label: "Échoué", classe: "bg-red-50 text-red-700" },
};

// Recherche un parent par nom de famille. Sert à la fois à rattacher un
// encaissement à une famille (mode "maintenant") et à choisir le
// destinataire d'une demande de paiement par e-mail (mode "email") : dans
// les deux cas on a besoin de retrouver la bonne fiche parent.
function RechercheDestinataire({ accessToken, choisi, onChoisir }) {
  const [familles, setFamilles] = useState([]);
  const [recherche, setRecherche] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [familleEnAttente, setFamilleEnAttente] = useState(null);

  useEffect(() => {
    fetch("/api/admin/encaissements/familles", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((data) => setFamilles(data.familles || []));
  }, [accessToken]);

  const resultats =
    recherche.trim().length < 2
      ? []
      : familles
          .filter((f) => f.label.toLowerCase().includes(recherche.trim().toLowerCase()))
          .slice(0, 8);

  function choisirFamille(f) {
    if (f.parents.length === 1) {
      const p = f.parents[0];
      onChoisir({ familyId: f.id, prenom: p.firstName || "", nom: p.lastName || "", email: p.email });
      setRecherche(f.label);
      setOuvert(false);
    } else {
      setFamilleEnAttente(f);
      setOuvert(false);
    }
  }

  if (choisi) {
    return (
      <p className="text-sm text-slate-600">
        <span className="font-medium">
          {choisi.prenom} {choisi.nom}
        </span>
        {choisi.email ? ` — ${choisi.email}` : ""}{" "}
        <button
          type="button"
          onClick={() => {
            onChoisir(null);
            setRecherche("");
          }}
          className="text-sou-blue underline text-xs ml-1"
        >
          retirer
        </button>
      </p>
    );
  }

  if (familleEnAttente) {
    return (
      <div className="border border-slate-200 rounded-lg p-3 text-sm">
        <p className="text-slate-600 mb-2">Quel parent, chez {familleEnAttente.label} ?</p>
        <div className="flex flex-wrap gap-2">
          {familleEnAttente.parents.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => {
                onChoisir({ familyId: familleEnAttente.id, prenom: p.firstName || "", nom: p.lastName || "", email: p.email });
                setRecherche(`${p.firstName || ""} ${p.lastName || ""}`.trim());
                setFamilleEnAttente(null);
              }}
              className="border border-slate-300 rounded-full px-3 py-1 hover:border-sou-blue"
            >
              {p.firstName} {p.lastName}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setFamilleEnAttente(null)}
          className="text-xs text-slate-400 underline mt-2"
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={recherche}
        onChange={(e) => {
          setRecherche(e.target.value);
          setOuvert(true);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
        placeholder="Rechercher un parent par nom..."
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
      />
      {ouvert && resultats.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-sm max-h-48 overflow-auto">
          {resultats.map((f) => (
            <button
              type="button"
              key={f.id}
              onClick={() => choisirFamille(f)}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NouvelEncaissementForm({ accessToken, onCree }) {
  const [mode, setMode] = useState("maintenant"); // maintenant | email
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [motif, setMotif] = useState("");
  const [montant, setMontant] = useState("");
  const [destinataire, setDestinataire] = useState(null); // { familyId, prenom, nom, email }
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [succesEmail, setSuccesEmail] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErreur("");
    setSuccesEmail("");

    if (mode === "email" && !destinataire) {
      setErreur("Choisissez le parent qui recevra la demande de paiement.");
      return;
    }

    setEnvoi(true);
    try {
      const body =
        mode === "email"
          ? {
              mode: "email",
              prenom: destinataire.prenom,
              nom: destinataire.nom,
              motif,
              montant,
              familyId: destinataire.familyId,
              parentEmail: destinataire.email,
            }
          : { mode: "maintenant", prenom, nom, motif, montant, familyId: destinataire?.familyId || null };

      const res = await fetch("/api/admin/encaissements", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");

      if (mode === "email") {
        setSuccesEmail(`Demande de paiement envoyée à ${destinataire.email}.`);
        setPrenom("");
        setNom("");
        setMotif("");
        setMontant("");
        setDestinataire(null);
        setEnvoi(false);
        onCree();
      } else {
        // HelloAsso refuse d'être affiché en iframe : redirection pleine
        // page, comme pour la boutique et les cotisations.
        window.location.href = data.redirectUrl;
      }
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <h2 className="font-semibold text-slate-800">Nouvel encaissement</h2>

      <div className="flex flex-col gap-1.5 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "maintenant"} onChange={() => setMode("maintenant")} />
          Un membre du bureau paie maintenant
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "email"} onChange={() => setMode("email")} />
          Envoyer une demande de paiement par e-mail
        </label>
      </div>

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      {succesEmail && <p className="text-sm text-green-700">{succesEmail}</p>}

      {mode === "email" ? (
        <div>
          <label className="text-xs font-semibold text-slate-500">Qui doit payer ?</label>
          <RechercheDestinataire accessToken={accessToken} choisi={destinataire} onChoisir={setDestinataire} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Prénom</label>
            <input
              required
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              placeholder="Prénom de la personne qui règle"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Nom</label>
            <input
              required
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Nom de la personne qui règle"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-slate-500">Motif du paiement</label>
        <input
          required
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Ex : Rachat des invendus de la Foire 2026"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500">Montant</label>
        <div className="relative w-32">
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            className="w-full border border-slate-300 rounded-lg pl-3 pr-7 py-2 text-sm"
          />
          <span className="absolute inset-y-0 right-3 flex items-center text-slate-400 text-sm">€</span>
        </div>
      </div>

      {mode === "maintenant" && (
        <div>
          <label className="text-xs font-semibold text-slate-500">
            Rattacher à une famille (facultatif)
          </label>
          <p className="text-xs text-slate-400 mb-1">
            Fait apparaître ce paiement dans l&apos;historique d&apos;achat de la famille sur son espace adhérent.
          </p>
          <RechercheDestinataire accessToken={accessToken} choisi={destinataire} onChoisir={setDestinataire} />
        </div>
      )}

      <button
        type="submit"
        disabled={envoi}
        className="bg-sou-blue text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-50"
      >
        {envoi ? "..." : mode === "email" ? "Envoyer la demande de paiement" : "Créer le paiement"}
      </button>
    </form>
  );
}

function EncaissementsAdmin({ accessToken }) {
  const [encaissements, setEncaissements] = useState([]);
  const [chargement, setChargement] = useState(true);

  function recharger() {
    fetch("/api/admin/encaissements", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((data) => setEncaissements(data.encaissements || []))
      .finally(() => setChargement(false));
  }

  useEffect(() => {
    recharger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-sou-blue mb-1">Encaissements libres</h1>
      <p className="text-slate-500 text-sm mb-6">
        Pour tout paiement ponctuel hors boutique et cotisation (ex : remboursement personnel après
        une manifestation), encaissé par carte via HelloAsso plutôt que par un terminal à commission.
      </p>

      <div className="grid md:grid-cols-2 gap-8">
        <NouvelEncaissementForm accessToken={accessToken} onCree={recharger} />

        <div>
          <h2 className="font-semibold text-slate-800 mb-3">Historique</h2>
          {chargement ? (
            <p className="text-slate-500 text-sm">Chargement...</p>
          ) : encaissements.length === 0 ? (
            <p className="text-slate-500 text-sm">Aucun encaissement pour le moment.</p>
          ) : (
            <div className="space-y-2">
              {encaissements.map((enc) => {
                const statut = STATUTS[enc.status] || STATUTS.pending;
                return (
                  <div key={enc.id} className="border border-slate-200 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-800">{enc.nom}</p>
                        <p className="text-sm text-slate-500">{enc.motif}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {formatHeure(enc.paid_at || enc.created_at)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-slate-800">{formatMontant(enc.montant_cents)}</p>
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statut.classe}`}>
                          {statut.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminEncaissementsPage() {
  return (
    <AdminShell title="Encaissements libres">
      {(accessToken) => <EncaissementsAdmin accessToken={accessToken} />}
    </AdminShell>
  );
}
