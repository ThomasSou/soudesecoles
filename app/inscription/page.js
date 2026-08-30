"use client";

import { useState } from "react";
import Link from "next/link";

const EMPTY_CHILD = { firstName: "", lastName: "", classLevel: "" };

const CLASSES = [
  "PS", "MS", "GS",
  "CP", "CE1", "CE2", "CM1", "CM2",
];

export default function InscriptionPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [children, setChildren] = useState([{ ...EMPTY_CHILD }]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Cas particulier : l'e-mail correspond déjà à un compte. On affiche alors
  // un message avec les liens vers la connexion et la réinitialisation du
  // mot de passe (impossible à rendre dans la chaîne d'erreur simple).
  const [compteExistant, setCompteExistant] = useState(false);
  const [sent, setSent] = useState(false);

  function updateChild(index, field, value) {
    setChildren((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setCompteExistant(false);

    const enfantsValides = children.filter(
      (c) => c.firstName.trim() && c.lastName.trim()
    );
    if (enfantsValides.length === 0) {
      setError("Merci de renseigner au moins un enfant scolarisé.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/inscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          children: enfantsValides,
          message,
        }),
      });
      const result = await res.json();
      setLoading(false);

      if (!res.ok) {
        if (res.status === 409) {
          setCompteExistant(true);
          return;
        }
        setError(result.error || "Une erreur est survenue. Merci de réessayer.");
        return;
      }
      setSent(true);
    } catch {
      setLoading(false);
      setError("Une erreur est survenue. Merci de réessayer.");
    }
  }

  if (sent) {
    return (
      <section className="max-w-xl mx-auto px-4 sm:px-6 py-20 text-center">
        <div className="text-5xl mb-4">✓</div>
        <h1 className="text-2xl font-bold text-sou-blue mb-4">
          Votre demande est envoyée
        </h1>
        <p className="text-slate-600">
          Le bureau du Sou des Écoles va la vérifier. Une fois validée, vous
          recevrez un e-mail à l&apos;adresse <strong>{email}</strong> avec un
          lien pour créer votre mot de passe et accéder à votre espace famille.
        </p>
        <p className="text-slate-500 text-sm mt-4">
          Cette vérification est manuelle, merci de votre patience.
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-2xl mx-auto px-4 sm:px-6 py-14">
      <h1 className="text-3xl font-bold text-sou-blue mb-2">
        Créer mon espace famille
      </h1>
      <p className="text-slate-600 mb-6">
        L&apos;espace famille vous permet de suivre votre adhésion, vos achats
        lors des manifestations et de recevoir les informations de
        l&apos;association.
      </p>

      {/* Beaucoup de familles ont été importées depuis les listes de classe :
          leur espace existe déjà, elles n'ont simplement jamais choisi de mot
          de passe. Sans cet avertissement en tête de page, elles remplissent
          ce formulaire pour rien et tombent sur « Un compte existe déjà ».
          On les réoriente d'emblée vers le choix du mot de passe. */}
      <div className="bg-sou-gold/10 border border-sou-gold/40 rounded-xl p-5 mb-6">
        <p className="font-semibold text-sou-blue mb-1">
          Votre famille est peut-être déjà connue du Sou
        </p>
        <p className="text-sm text-slate-600">
          Si vos enfants étaient déjà scolarisés l&apos;an dernier, ou si vous
          avez reçu un e-mail de notre part, votre espace famille existe déjà.
          N&apos;utilisez pas ce formulaire :{" "}
          <Link
            href="/mot-de-passe-oublie"
            className="font-semibold text-sou-blue underline"
          >
            choisissez votre mot de passe ici
          </Link>{" "}
          pour accéder à votre espace.
        </p>
      </div>

      <div className="bg-sou-blue/5 border border-sou-blue/20 rounded-xl p-5 mb-8">
        <p className="font-semibold text-sou-blue mb-1">
          Qui peut faire cette demande ?
        </p>
        <p className="text-sm text-slate-600">
          L&apos;inscription est réservée aux parents d&apos;élèves
          <strong> scolarisés cette année à l&apos;école Mick Micheyl</strong> de
          Montmerle-sur-Saône. Votre demande sera vérifiée par le bureau avant
          l&apos;ouverture de votre compte.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div>
          <h2 className="font-semibold text-sou-blue mb-3">Vos coordonnées</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Prénom *
              </label>
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-4 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nom *
              </label>
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-4 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Adresse e-mail *
              </label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-4 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Téléphone *
              </label>
              <input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-4 py-2"
              />
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sou-blue">
              Vos enfants scolarisés
            </h2>
            <button
              type="button"
              onClick={() => setChildren((p) => [...p, { ...EMPTY_CHILD }])}
              className="text-sm text-sou-blue underline"
            >
              + Ajouter un enfant
            </button>
          </div>

          <div className="space-y-3">
            {children.map((child, i) => (
              <div
                key={i}
                className="grid gap-3 sm:grid-cols-3 border border-slate-200 rounded-lg p-4"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Prénom
                  </label>
                  <input
                    value={child.firstName}
                    onChange={(e) => updateChild(i, "firstName", e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Nom
                  </label>
                  <input
                    value={child.lastName}
                    onChange={(e) => updateChild(i, "lastName", e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Classe
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={child.classLevel}
                      onChange={(e) =>
                        updateChild(i, "classLevel", e.target.value)
                      }
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="">—</option>
                      {CLASSES.map((cl) => (
                        <option key={cl} value={cl}>
                          {cl}
                        </option>
                      ))}
                    </select>
                    {children.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setChildren((p) => p.filter((_, j) => j !== i))
                        }
                        className="text-slate-400 hover:text-red-500 px-1"
                        aria-label="Retirer cet enfant"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Message (facultatif)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-4 py-2"
          />
        </div>

        {compteExistant ? (
          /* Ce n'est pas une erreur mais une bonne nouvelle : l'espace
             existe déjà (famille importée depuis les listes de classe).
             On l'affiche en vert, sans dramatiser, avec un vrai bouton
             vers le choix du mot de passe plutôt qu'un lien noyé. */
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-3">
            <p className="font-semibold text-emerald-800">
              Bonne nouvelle : votre espace famille existe déjà
            </p>
            <p className="text-sm text-slate-600">
              Il a été créé automatiquement par le Sou à partir des listes de
              classe. Vous n&apos;avez rien à créer ici : il vous reste
              seulement à choisir votre mot de passe pour y accéder.
            </p>
            <Link
              href="/mot-de-passe-oublie"
              className="inline-block bg-sou-blue text-white font-semibold px-5 py-2.5 rounded-full hover:bg-sou-gold transition-colors"
            >
              Choisir mon mot de passe
            </Link>
          </div>
        ) : (
          error && <p className="text-red-600 text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-sou-blue text-white font-semibold px-6 py-3 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-60"
        >
          {loading ? "Envoi..." : "Envoyer ma demande"}
        </button>

        <p className="text-sm text-slate-500 text-center">
          Vous avez déjà un compte ?{" "}
          <Link href="/connexion" className="text-sou-blue underline">
            Connectez-vous
          </Link>
        </p>
      </form>
    </section>
  );
}
