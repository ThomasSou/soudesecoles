"use client";

import { useState } from "react";

// Page admin temporaire (non listee dans la navigation) : permet de generer
// un lien d'activation/reinitialisation directement, sans passer par l'envoi
// d'e-mail Supabase (utile tant que le probleme de lien grille avant lecture
// n'est pas resolu, et tant qu'aucun fournisseur SMTP n'est configure).
// Protegee par le jeton ADMIN_IMPORT_TOKEN, saisi ici et jamais stocke.
export default function GenererLienPage() {
  const [adminToken, setAdminToken] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLink("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin-generate-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken,
        },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur inconnue.");
      } else {
        setLink(data.link);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="max-w-md mx-auto px-4 sm:px-6 py-20">
      <h1 className="text-2xl font-bold text-sou-blue mb-2">
        Générer un lien d'activation
      </h1>
      <p className="text-sm text-slate-500 mb-8">
        Page admin temporaire. Le lien généré est à usage unique : cliquez
        dessus immédiatement.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="password"
          required
          placeholder="Jeton admin"
          value={adminToken}
          onChange={(e) => setAdminToken(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-4 py-2"
        />
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
          {loading ? "Génération..." : "Générer le lien"}
        </button>
      </form>

      {link && (
        <div className="mt-6 border border-green-200 bg-green-50 rounded-xl p-4 text-center">
          <p className="text-sm text-slate-600 mb-3">
            Lien généré — cliquez dessus maintenant :
          </p>
          <a
            href={link}
            className="inline-block bg-sou-blue text-white font-semibold px-6 py-3 rounded-full hover:bg-sou-gold transition-colors"
          >
            Activer le compte
          </a>
        </div>
      )}
    </section>
  );
}
