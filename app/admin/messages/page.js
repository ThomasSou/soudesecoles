"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../admin-shell";

export default function AdminMessagesPage() {
  return (
    <AdminShell title="Messages reçus">
      {(token) => <ListeMessages token={token} />}
    </AdminShell>
  );
}

function ListeMessages({ token }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [voirTraites, setVoirTraites] = useState(false);
  // Id du message dont le formulaire de réponse est ouvert.
  const [reponseOuverte, setReponseOuverte] = useState(null);
  const [brouillon, setBrouillon] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/admin/messages", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setMessages(data.messages || []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function basculer(id, handled) {
    await fetch("/api/admin/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id, handled }),
    });
    charger();
  }

  function ouvrirReponse(m) {
    setReponseOuverte(m.id);
    setBrouillon(m.reply_body || "");
    setErreur("");
  }

  function annulerReponse() {
    setReponseOuverte(null);
    setBrouillon("");
    setErreur("");
  }

  async function envoyerReponse(id) {
    if (!brouillon.trim()) {
      setErreur("Écrivez une réponse avant d'envoyer.");
      return;
    }
    setEnvoi(true);
    setErreur("");
    const res = await fetch("/api/admin/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id, reply: brouillon }),
    });
    const data = await res.json();
    setEnvoi(false);

    if (!res.ok) {
      setErreur(data.error || "L'envoi a échoué.");
      return;
    }
    annulerReponse();
    charger();
  }

  if (loading) {
    return <p className="text-slate-500">Chargement des messages...</p>;
  }

  const visibles = voirTraites ? messages : messages.filter((m) => !m.handled);

  return (
    <div>
      <label className="flex items-center gap-2 text-sm text-slate-600 mb-6">
        <input
          type="checkbox"
          checked={voirTraites}
          onChange={(e) => setVoirTraites(e.target.checked)}
        />
        Afficher aussi les messages déjà traités
      </label>

      {visibles.length === 0 ? (
        <p className="text-slate-500">Aucun message à traiter.</p>
      ) : (
        <div className="space-y-4">
          {visibles.map((m) => (
            <div
              key={m.id}
              className={`border rounded-xl p-5 ${
                m.handled
                  ? "border-slate-100 bg-slate-50/60"
                  : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-sou-blue">{m.name}</p>
                  <a
                    href={`mailto:${m.email}`}
                    className="text-sm text-slate-600 underline"
                  >
                    {m.email}
                  </a>
                </div>
                <p className="text-xs text-slate-400">
                  {new Date(m.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>

              {m.subject && (
                <p className="font-medium text-slate-700 mt-3">{m.subject}</p>
              )}
              <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">
                {m.message}
              </p>

              {m.replied_at && (
                <div className="mt-4 border-l-2 border-sou-blue/30 pl-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Réponse envoyée le{" "}
                    {new Date(m.replied_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">
                    {m.reply_body}
                  </p>
                </div>
              )}

              {reponseOuverte === m.id ? (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Votre réponse (envoyée depuis contact@sou-montmerle.fr, le
                    message d&apos;origine est cité en dessous)
                  </label>
                  <textarea
                    value={brouillon}
                    onChange={(e) => setBrouillon(e.target.value)}
                    rows={5}
                    disabled={envoi}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:opacity-60"
                  />
                  {erreur && (
                    <p className="text-red-600 text-sm mt-2">{erreur}</p>
                  )}
                  <div className="flex gap-3 mt-3">
                    <button
                      onClick={() => envoyerReponse(m.id)}
                      disabled={envoi}
                      className="bg-sou-blue text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-60"
                    >
                      {envoi ? "Envoi..." : "Envoyer la réponse"}
                    </button>
                    <button
                      onClick={annulerReponse}
                      disabled={envoi}
                      className="text-sm text-slate-500 hover:text-sou-blue px-3 disabled:opacity-60"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 mt-4 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => ouvrirReponse(m)}
                    className="bg-sou-blue text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-sou-gold transition-colors"
                  >
                    {m.replied_at ? "Répondre à nouveau" : "Répondre"}
                  </button>
                  <button
                    onClick={() => basculer(m.id, !m.handled)}
                    className="text-sm text-slate-500 hover:text-sou-blue px-3"
                  >
                    {m.handled ? "Marquer non traité" : "Marquer comme traité"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
