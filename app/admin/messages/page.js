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

              <div className="flex gap-3 mt-4 pt-4 border-t border-slate-100">
                <a
                  href={`mailto:${m.email}?subject=${encodeURIComponent(
                    "Re: " + (m.subject || "Votre message")
                  )}`}
                  className="bg-sou-blue text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-sou-gold transition-colors"
                >
                  Répondre
                </a>
                <button
                  onClick={() => basculer(m.id, !m.handled)}
                  className="text-sm text-slate-500 hover:text-sou-blue px-3"
                >
                  {m.handled ? "Marquer non traité" : "Marquer comme traité"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
