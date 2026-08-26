"use client";

import { useEffect, useState } from "react";

const CLE_STOCKAGE = "sou_partenaire_session";

function NouvelAvantageForm({ session, onCree }) {
  const [label, setLabel] = useState("");
  const [requiresMembership, setRequiresMembership] = useState(true);
  const [limite, setLimite] = useState("1");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [ouvert, setOuvert] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      const res = await fetch("/api/partenaire/avantages/creer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partenaireId: session.partenaireId,
          pin: session.pin,
          label,
          requiresMembership,
          limite,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
      setLabel("");
      setRequiresMembership(true);
      setLimite("1");
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
          placeholder="Ex : -10% sur l'addition"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={requiresMembership}
          onChange={(e) => setRequiresMembership(e.target.checked)}
        />
        Réservé aux familles à jour de cotisation
      </label>
      <div>
        <label className="text-xs font-semibold text-slate-500">
          Nombre d&apos;utilisations autorisées par famille
        </label>
        <input
          required
          type="number"
          min="1"
          value={limite}
          onChange={(e) => setLimite(e.target.value)}
          className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={envoi}
          className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50"
        >
          {envoi ? "Création..." : "Créer"}
        </button>
        <button type="button" onClick={() => setOuvert(false)} className="text-sm text-slate-500 px-4 py-2">
          Annuler
        </button>
      </div>
    </form>
  );
}

function LigneAvantage({ avantage, session, onMaj }) {
  const [envoi, setEnvoi] = useState(false);
  const [editionLimite, setEditionLimite] = useState(false);
  const [limite, setLimite] = useState(avantage.limite);

  async function patch(body) {
    setEnvoi(true);
    try {
      const res = await fetch(`/api/partenaire/avantages/${avantage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partenaireId: session.partenaireId, pin: session.pin, ...body }),
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
            {avantage.requiert_adhesion ? "réservé aux adhérents à jour" : "ouvert à tous"}
            {" — "}
            {avantage.utilisations} utilisation{avantage.utilisations > 1 ? "s" : ""}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Utilisable{" "}
            {editionLimite ? (
              <>
                <input
                  type="number"
                  min="1"
                  value={limite}
                  onChange={(e) => setLimite(e.target.value)}
                  className="w-14 border border-slate-300 rounded px-1 py-0.5 text-xs"
                />{" "}
                fois par famille{" "}
                <button
                  onClick={async () => {
                    await patch({ limite });
                    setEditionLimite(false);
                  }}
                  disabled={envoi}
                  className="underline"
                >
                  enregistrer
                </button>
              </>
            ) : (
              <>
                {avantage.limite} fois par famille{" "}
                <button onClick={() => setEditionLimite(true)} className="underline">
                  modifier
                </button>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-semibold px-2 py-1 rounded-full ${
              avantage.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
            }`}
          >
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
    </div>
  );
}

function EspacePartenaire({ session, onDeconnexion }) {
  const [chargement, setChargement] = useState(true);
  const [avantages, setAvantages] = useState([]);

  useEffect(() => {
    fetch("/api/partenaire/avantages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partenaireId: session.partenaireId, pin: session.pin }),
    })
      .then((r) => r.json())
      .then((data) => setAvantages(data.avantages || []))
      .finally(() => setChargement(false));
  }, [session]);

  function majAvantage(maj) {
    setAvantages((prev) => prev.map((a) => (a.id === maj.id ? { ...a, ...maj } : a)));
  }

  return (
    <div>
      <div className="border border-green-200 bg-green-50 rounded-2xl p-6 text-center mb-6">
        <p className="text-green-800 font-semibold mb-1">Connecté</p>
        <p className="text-slate-700 mb-4">{session.nom}</p>
        <p className="text-sm text-slate-500 mb-4">
          Scannez les cartes des adhérents avec l&apos;appareil photo de votre téléphone (comme un QR
          code classique) : le bouton de validation apparaît automatiquement sur la page de la carte
          pour chacun de vos avantages actifs.
        </p>
        <button onClick={onDeconnexion} className="text-sm text-slate-500 underline">
          Se déconnecter
        </button>
      </div>

      <h2 className="text-lg font-bold text-sou-blue mb-3">Vos avantages</h2>
      {chargement ? (
        <p className="text-slate-500 text-sm">Chargement...</p>
      ) : (
        <div className="space-y-4">
          <NouvelAvantageForm
            session={session}
            onCree={(a) => setAvantages((prev) => [a, ...prev])}
          />
          {avantages.length === 0 ? (
            <p className="text-slate-500 text-sm">Vous n&apos;avez pas encore créé d&apos;avantage.</p>
          ) : (
            <div className="space-y-3">
              {avantages.map((a) => (
                <LigneAvantage key={a.id} avantage={a} session={session} onMaj={majAvantage} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PartenairePage() {
  const [session, setSession] = useState(null);
  const [verification, setVerification] = useState(true);
  const [pin, setPin] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    const brut = window.localStorage.getItem(CLE_STOCKAGE);
    if (!brut) {
      setVerification(false);
      return;
    }
    let sauvegarde;
    try {
      sauvegarde = JSON.parse(brut);
    } catch {
      window.localStorage.removeItem(CLE_STOCKAGE);
      setVerification(false);
      return;
    }
    if (!sauvegarde?.partenaireId || !sauvegarde?.pin) {
      window.localStorage.removeItem(CLE_STOCKAGE);
      setVerification(false);
      return;
    }
    fetch("/api/partenaire/avantages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partenaireId: sauvegarde.partenaireId, pin: sauvegarde.pin }),
    })
      .then((r) => (r.ok ? setSession(sauvegarde) : window.localStorage.removeItem(CLE_STOCKAGE)))
      .finally(() => setVerification(false));
  }, []);

  async function connecter(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      const res = await fetch("/api/partenaire/connexion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Code invalide.");
      const nouvelleSession = { partenaireId: data.partenaire.id, nom: data.partenaire.nom, pin };
      window.localStorage.setItem(CLE_STOCKAGE, JSON.stringify(nouvelleSession));
      setSession(nouvelleSession);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  function deconnecter() {
    window.localStorage.removeItem(CLE_STOCKAGE);
    setSession(null);
    setPin("");
  }

  return (
    <section className="max-w-md mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-2xl font-bold text-sou-blue mb-2 text-center">Espace partenaire</h1>
      <p className="text-sm text-slate-500 text-center mb-8">
        Sou des Écoles Laïques Montmerle-Lurcy
      </p>

      {verification ? (
        <p className="text-center text-slate-400 text-sm">Chargement...</p>
      ) : session ? (
        <EspacePartenaire session={session} onDeconnexion={deconnecter} />
      ) : (
        <form onSubmit={connecter} className="border border-slate-200 rounded-2xl p-6">
          <label className="block text-sm font-medium text-slate-600 mb-2">
            Code à 4 chiffres communiqué par le Sou des Écoles
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-center text-2xl tracking-widest"
            placeholder="0000"
            autoFocus
          />
          {erreur && <p className="text-red-600 text-sm mt-3">{erreur}</p>}
          <button
            type="submit"
            disabled={envoi || pin.length !== 4}
            className="w-full mt-4 bg-sou-blue text-white font-semibold px-5 py-3 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-50"
          >
            {envoi ? "Vérification..." : "Se connecter"}
          </button>
        </form>
      )}
    </section>
  );
}
