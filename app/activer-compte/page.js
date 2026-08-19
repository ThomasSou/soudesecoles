"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabaseClient";

export default function ActiverComptePage() {
  const router = useRouter();
  const [status, setStatus] = useState("chargement"); // chargement | pret | erreur
  const [errorMsg, setErrorMsg] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    const hash = typeof window !== "undefined" ? window.location.hash : "";

    // Supabase ajoute soit des jetons de session (lien valide), soit
    // error=...&error_code=... (lien expire ou deja utilise) au hash de l'URL.
    if (hash.includes("error=")) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const code = params.get("error_code");
      if (code === "otp_expired") {
        setErrorMsg(
          "Ce lien d'invitation a expiré ou a déjà été utilisé. Contactez le Sou des Écoles pour recevoir une nouvelle invitation."
        );
      } else {
        setErrorMsg(
          "Ce lien d'invitation n'est plus valide. Contactez le Sou des Écoles pour recevoir une nouvelle invitation."
        );
      }
      setStatus("erreur");
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setStatus("pret");
      } else {
        setErrorMsg(
          "Ce lien d'invitation n'est plus valide. Contactez le Sou des Écoles pour recevoir une nouvelle invitation."
        );
        setStatus("erreur");
      }
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    if (password.length < 8) {
      setFormError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setFormError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setFormError("Erreur : " + error.message);
      return;
    }

    router.push("/espace-adherent");
  }

  if (status === "chargement") {
    return (
      <section className="max-w-md mx-auto px-4 sm:px-6 py-20 text-center text-slate-500">
        Chargement...
      </section>
    );
  }

  if (status === "erreur") {
    return (
      <section className="max-w-md mx-auto px-4 sm:px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-sou-blue mb-4">Lien invalide</h1>
        <p className="text-slate-600">{errorMsg}</p>
      </section>
    );
  }

  return (
    <section className="max-w-md mx-auto px-4 sm:px-6 py-20">
      <h1 className="text-3xl font-bold text-sou-blue mb-2">Bienvenue !</h1>
      <p className="text-slate-600 mb-8">
        Créez votre mot de passe pour accéder à l'espace adhérent du Sou des
        Écoles Montmerle-Lurcy.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="password"
          required
          minLength={8}
          placeholder="Choisissez un mot de passe (8 caractères min.)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-4 py-2"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Confirmez le mot de passe"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-4 py-2"
        />

        {formError && <p className="text-red-600 text-sm">{formError}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-sou-blue text-white font-semibold px-6 py-3 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-60"
        >
          {saving ? "Enregistrement..." : "Créer mon compte"}
        </button>
      </form>
    </section>
  );
}
