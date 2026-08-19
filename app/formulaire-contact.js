"use client";

import { useState } from "react";

// Formulaire de contact réutilisable.
// - Sur la page publique /contact : tous les champs sont saisis.
// - Sur l'espace adhérent : nom et e-mail sont repris du compte connecté
//   (props `defaultName` / `defaultEmail` + `locked`), l'adhérent n'a plus
//   qu'à écrire son message.
export default function FormulaireContact({
  defaultName = "",
  defaultEmail = "",
  locked = false,
  context,
  compact = false,
}) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("Merci de renseigner votre nom, votre e-mail et votre message.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, context }),
      });
      const result = await res.json();
      setSending(false);

      if (!res.ok) {
        setError(
          result.error ||
            "Votre message n'a pas pu être envoyé. Vous pouvez nous écrire à contactsoudesecolesmontmerle@gmail.com."
        );
        return;
      }
      setSent(true);
    } catch {
      setSending(false);
      setError(
        "Votre message n'a pas pu être envoyé. Vous pouvez nous écrire à contactsoudesecolesmontmerle@gmail.com."
      );
    }
  }

  if (sent) {
    return (
      <div className="text-center py-6">
        <p className="text-lg font-semibold text-sou-blue mb-1">
          Merci, votre message est bien arrivé !
        </p>
        <p className="text-slate-600 text-sm">
          Nous vous répondrons dès que possible à l&apos;adresse {email}.
        </p>
        <button
          onClick={() => {
            setSent(false);
            setSubject("");
            setMessage("");
          }}
          className="mt-4 text-sm text-sou-blue underline"
        >
          Écrire un autre message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!locked && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Votre nom *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-4 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Votre e-mail *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-4 py-2"
            />
          </div>
        </div>
      )}

      {locked && (
        <p className="text-sm text-slate-500">
          Message envoyé en tant que <strong>{name}</strong> ({email})
        </p>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Sujet
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Adhésion, partenariat, bénévolat..."
          className="w-full border border-slate-300 rounded-lg px-4 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Votre message *
        </label>
        <textarea
          required
          rows={compact ? 4 : 6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-4 py-2"
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={sending}
        className="bg-sou-blue text-white font-semibold px-6 py-3 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-60"
      >
        {sending ? "Envoi..." : "Envoyer le message"}
      </button>
    </form>
  );
}
