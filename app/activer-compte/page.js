"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../lib/supabaseClient";
import { espaceApresConnexion } from "../lib/espaceClient";

export default function ActiverComptePage() {
  return (
    <Suspense fallback={null}>
      <ActiverCompteForm />
    </Suspense>
  );
}

function ActiverCompteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jeton = searchParams.get("jeton");
  // Après activation, on appelle /api/moi/espace pour aiguiller selon le rôle
  // (bureau > enseignant > partenaire > parent). Le paramètre ?espace= de
  // l'invitation ne sert plus que de repli si cette route échoue : une
  // invitation partenaire retombe alors sur /partenaire, sinon /espace-adherent.
  const espace = searchParams.get("espace");
  const repliApresActivation =
    espace === "partenaire" ? "/partenaire" : "/espace-adherent";

  const [status, setStatus] = useState("chargement"); // chargement | pret | erreur
  const [errorMsg, setErrorMsg] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    // Circuit maison (lien envoyé via Sender) : le jeton dans l'URL suffit,
    // pas besoin d'établir de session Supabase avant de choisir un mot de
    // passe — c'est la route /api/activer-compte qui vérifie le jeton.
    if (jeton) {
      setStatus("pret");
      return;
    }

    const supabase = createClient();
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const params = new URLSearchParams(hash.replace(/^#/, ""));

    function showInvalid(code) {
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
    }

    // Supabase ajoute soit des jetons de session (lien valide), soit
    // error=...&error_code=... (lien expire ou deja utilise) au hash de l'URL.
    if (params.get("error") || params.get("error_code")) {
      showInvalid(params.get("error_code"));
      return;
    }

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      // Pas de jetons dans l'URL : peut-être une session déjà active
      // (rechargement de page après succès).
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setStatus("pret");
        } else {
          showInvalid();
        }
      });
      return;
    }

    // IMPORTANT : on n'utilise pas la détection automatique du hash par le
    // SDK (detectSessionInUrl). @supabase/ssr force flowType="pkce", ce qui
    // fait échouer silencieusement l'analyse des liens "implicit flow"
    // (jetons dans le hash) générés par l'API admin (invitation /
    // réinitialisation). On établit donc la session nous-mêmes avec les
    // jetons présents dans l'URL : ça fonctionne quel que soit le flowType
    // configuré sur le client.
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error }) => {
        if (error || !data.session) {
          showInvalid();
          return;
        }
        // Nettoie les jetons de l'URL une fois la session établie.
        window.history.replaceState(null, "", window.location.pathname);
        setStatus("pret");
      });
  }, [jeton]);

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

    if (jeton) {
      try {
        const res = await fetch("/api/activer-compte", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: jeton, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");

        const supabase = createClient();
        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: data.email,
            password,
          });
        if (signInError) throw signInError;

        router.push(
          await espaceApresConnexion(
            signInData?.session?.access_token,
            repliApresActivation
          )
        );
      } catch (err) {
        setFormError(err.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setSaving(false);
      setFormError("Erreur : " + error.message);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    setSaving(false);
    router.push(
      await espaceApresConnexion(session?.access_token, repliApresActivation)
    );
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
        <div className="relative">
          <input
            type={motDePasseVisible ? "text" : "password"}
            required
            minLength={8}
            placeholder="Choisissez un mot de passe (8 caractères min.)"
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
        <div className="relative">
          <input
            type={motDePasseVisible ? "text" : "password"}
            required
            minLength={8}
            placeholder="Confirmez le mot de passe"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
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
