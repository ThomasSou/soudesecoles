"use client";

import { useEffect, useState } from "react";

const CLE_STOCKAGE = "sou_partenaire_session";

export default function PartenairePage() {
  const [session, setSession] = useState(null);
  const [pin, setPin] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    const brut = window.localStorage.getItem(CLE_STOCKAGE);
    if (brut) {
      try {
        setSession(JSON.parse(brut));
      } catch {
        window.localStorage.removeItem(CLE_STOCKAGE);
      }
    }
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
      const nouvelleSession = { avantageId: data.avantage.id, label: data.avantage.label, pin };
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

      {session ? (
        <div className="border border-green-200 bg-green-50 rounded-2xl p-6 text-center">
          <p className="text-green-800 font-semibold mb-1">Connecté</p>
          <p className="text-slate-700 mb-4">{session.label}</p>
          <p className="text-sm text-slate-500 mb-6">
            Vous pouvez maintenant scanner les cartes des adhérents avec
            l&apos;appareil photo de votre téléphone (comme un QR code
            classique) : le bouton de validation apparaîtra automatiquement
            sur la page de la carte.
          </p>
          <button
            onClick={deconnecter}
            className="text-sm text-slate-500 underline"
          >
            Se déconnecter
          </button>
        </div>
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
