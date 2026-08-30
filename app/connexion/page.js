"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "../lib/supabaseClient";
import { espaceApresConnexion } from "../lib/espaceClient";

export default function ConnexionPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Adresse e-mail ou mot de passe incorrect.");
      setLoading(false);
      return;
    }

    // Aiguillage selon le rôle : bureau > enseignant > partenaire > parent.
    // En cas de pépin, on retombe sur l'espace famille.
    router.push(await espaceApresConnexion(data?.session?.access_token));
  }

  return (
    <section className="max-w-md mx-auto px-4 sm:px-6 py-20">
      <h1 className="text-3xl font-bold text-sou-blue mb-8">Espace adhérent</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          required
          placeholder="Adresse e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-4 py-2"
        />
        <div className="relative">
          <input
            type={motDePasseVisible ? "text" : "password"}
            required
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-4 py-2 pr-16"
          />
          <button
            type="button"
            onClick={() => setMotDePasseVisible((v) => !v)}
            tabIndex={-1}
            className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-slate-500 hover:text-sou-blue"
          >
            {motDePasseVisible ? "Masquer" : "Afficher"}
          </button>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-sou-blue text-white font-semibold px-6 py-3 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-60"
        >
          {loading ? "Connexion..." : "Se connecter"}
        </button>

        <p className="text-sm text-slate-500 text-center">
          <Link
            href="/mot-de-passe-oublie"
            className="text-sou-blue underline"
          >
            Mot de passe oublié ?
          </Link>
        </p>

        <p className="text-sm text-slate-500 text-center">
          Vous n'avez pas encore de compte ?{" "}
          <Link href="/inscription" className="text-sou-blue underline">
            Créer mon espace famille
          </Link>
        </p>
      </form>
    </section>
  );
}
