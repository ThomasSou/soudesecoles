"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "../lib/supabaseClient";

const EMPTY_CHILD = { firstName: "", lastName: "", classLevel: "" };

export default function InscriptionPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [children, setChildren] = useState([{ ...EMPTY_CHILD }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateChild(index, field, value) {
    setChildren((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  }

  function addChild() {
    setChildren((prev) => [...prev, { ...EMPTY_CHILD }]);
  }

  function removeChild(index) {
    setChildren((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      const accessToken = data?.session?.access_token;

      if (!accessToken) {
        // Confirmation email requise : on garde les infos saisies pour
        // finaliser la creation de la fiche famille juste apres la
        // premiere connexion (voir app/espace-adherent/page.js).
        try {
          window.localStorage.setItem(
            "pending_family_signup",
            JSON.stringify({
              firstName,
              lastName,
              phone,
              addressLine,
              postalCode,
              city,
              children,
            })
          );
        } catch (storageErr) {
          // localStorage indisponible (navigation privee, etc.) : tant pis,
          // la personne devra saisir a nouveau ces infos.
        }
        setError(
          "Compte cree. Merci de confirmer votre adresse e-mail (voir votre boite de reception), puis connectez-vous : vos informations seront enregistrees automatiquement."
        );
        setLoading(false);
        return;
      }

      const res = await fetch("/api/inscription-famille", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          firstName,
          lastName,
          phone,
          addressLine,
          postalCode,
          city,
          children,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "Une erreur est survenue.");
        setLoading(false);
        return;
      }

      router.push("/espace-adherent");
    } catch (err) {
      setError("Une erreur est survenue. Merci de reessayer.");
      setLoading(false);
    }
  }

  return (
    <section className="max-w-2xl mx-auto px-4 sm:px-6 py-14">
      <h1 className="text-3xl font-bold text-sou-blue mb-2">Créer un compte famille</h1>
      <p className="text-slate-600 mb-8">
        Un seul compte est nécessaire par famille pour accéder à l'espace
        adhérent, quel que soit le nombre d'enfants scolarisés.
      </p>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="space-y-4">
          <h2 className="font-semibold text-sou-blue">Connexion</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <input
              type="email"
              required
              placeholder="Adresse e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-slate-300 rounded-lg px-4 py-2"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-slate-300 rounded-lg px-4 py-2"
            />
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="font-semibold text-sou-blue">Vos coordonnées</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <input
              placeholder="Prénom"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="border border-slate-300 rounded-lg px-4 py-2"
            />
            <input
              placeholder="Nom"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="border border-slate-300 rounded-lg px-4 py-2"
            />
            <input
              placeholder="Téléphone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="border border-slate-300 rounded-lg px-4 py-2"
            />
            <input
              placeholder="Adresse"
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              className="border border-slate-300 rounded-lg px-4 py-2"
            />
            <input
              placeholder="Code postal"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className="border border-slate-300 rounded-lg px-4 py-2"
            />
            <input
              placeholder="Ville"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="border border-slate-300 rounded-lg px-4 py-2"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sou-blue">Vos enfants scolarisés</h2>
            <button
              type="button"
              onClick={addChild}
              className="text-sm text-sou-blue underline"
            >
              + Ajouter un enfant
            </button>
          </div>
          {children.map((child, i) => (
            <div key={i} className="grid gap-4 sm:grid-cols-3 items-center">
              <input
                placeholder="Prénom de l'enfant"
                value={child.firstName}
                onChange={(e) => updateChild(i, "firstName", e.target.value)}
                className="border border-slate-300 rounded-lg px-4 py-2"
              />
              <input
                placeholder="Nom de l'enfant"
                value={child.lastName}
                onChange={(e) => updateChild(i, "lastName", e.target.value)}
                className="border border-slate-300 rounded-lg px-4 py-2"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Classe (ex: CE1)"
                  value={child.classLevel}
                  onChange={(e) => updateChild(i, "classLevel", e.target.value)}
                  className="border border-slate-300 rounded-lg px-4 py-2 flex-1"
                />
                {children.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeChild(i)}
                    className="text-slate-400 hover:text-red-500 px-2"
                    aria-label="Supprimer cet enfant"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-sou-blue text-white font-semibold px-6 py-3 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-60"
        >
          {loading ? "Création en cours..." : "Créer mon compte famille"}
        </button>

        <p className="text-sm text-slate-500 text-center">
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="text-sou-blue underline">
            Connectez-vous
          </Link>
        </p>
      </form>
    </section>
  );
}
