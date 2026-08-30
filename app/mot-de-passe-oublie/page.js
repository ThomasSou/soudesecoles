"use client";

import { useState } from "react";
import Link from "next/link";

export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // On passe par une route serveur (et non par resetPasswordForEmail côté
    // client) : elle sait aussi traiter les familles importées qui n'ont pas
    // encore de compte de connexion, en leur envoyant un lien d'activation
    // plutôt qu'un simple reset qui ne pourrait rien faire.
    try {
      const res = await fetch("/api/mot-de-passe-oublie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch {
      setError(
        "L'envoi n'a pas pu aboutir. Merci de réessayer dans quelques minutes ou de nous contacter."
      );
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <section className="max-w-md mx-auto px-4 sm:px-6 py-20 text-center">
        <div className="text-4xl mb-4">✓</div>
        <h1 className="text-2xl font-bold text-sou-blue mb-3">
          C&apos;est envoyé
        </h1>
        <p className="text-slate-600">
          Si un compte existe avec l&apos;adresse <strong>{email}</strong>, vous
          allez recevoir un e-mail contenant un lien pour choisir votre mot de
          passe.
        </p>
        <p className="text-sm text-slate-500 mt-4">
          Pensez à vérifier vos courriers indésirables. Le lien peut mettre
          quelques minutes à arriver.
        </p>
        <Link
          href="/connexion"
          className="inline-block mt-8 text-sou-blue underline"
        >
          Retour à la connexion
        </Link>
      </section>
    );
  }

  return (
    <section className="max-w-md mx-auto px-4 sm:px-6 py-20">
      <h1 className="text-3xl font-bold text-sou-blue mb-2">
        Mot de passe oublié
      </h1>
      <p className="text-slate-600 mb-8">
        Indiquez l&apos;adresse e-mail de votre compte : nous vous enverrons un
        lien pour choisir votre mot de passe.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          required
          placeholder="Adresse e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-4 py-2"
        />

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-sou-blue text-white font-semibold px-6 py-3 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-60"
        >
          {loading ? "Envoi..." : "Recevoir le lien"}
        </button>

        <p className="text-sm text-slate-500 text-center">
          <Link href="/connexion" className="text-sou-blue underline">
            Retour à la connexion
          </Link>
        </p>
      </form>
    </section>
  );
}
