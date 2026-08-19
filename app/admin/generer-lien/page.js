"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

// Page admin temporaire (non listee dans la navigation) : permet de generer
// un lien d'activation/reinitialisation directement, sans passer par l'envoi
// d'e-mail Supabase (utile tant que le probleme de lien grille avant lecture
// n'est pas resolu, et tant qu'aucun fournisseur SMTP n'est configure).
// Protegee par le jeton ADMIN_IMPORT_TOKEN.
//
// Si l'URL contient ?token=...&email=..., la generation se fait automatiquement
// et redirige directement vers le lien d'activation (un seul clic depuis un
// lien tout pret, pas besoin de remplir le formulaire).
export default function GenererLienPage() {
  return (
    <Suspense fallback={null}>
      <GenererLienForm />
    </Suspense>
  );
}

function GenererLienForm() {
  const searchParams = useSearchParams();
  const urlToken = searchParams.get("token") || "";
  const urlEmail = searchParams.get("email") || "";

  const [adminToken, setAdminToken] = useState(urlToken);
  const [email, setEmail] = useState(urlEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [autoRedirecting, setAutoRedirecting] = useState(false);

  async function generate(token, mail) {
    setError("");
    setLink("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin-generate-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({ email: mail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur inconnue.");
        return null;
      }
      setLink(data.link);
      return data.link;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (urlToken && urlEmail) {
      setAutoRedirecting(true);
      generate(urlToken, urlEmail).then((generatedLink) => {
        if (generatedLink) {
          window.location.href = generatedLink;
        } else {
          setAutoRedirecting(false);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    await generate(adminToken, email);
  }

  if (autoRedirecting) {
    return (
      <section className="max-w-md mx-auto px-4 sm:px-6 py-20 text-center text-slate-500">
        {error ? (
          <p className="text-red-600 text-sm">{error}</p>
        ) : (
          "Génération du lien, redirection en cours..."
        )}
      </section>
    );
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
