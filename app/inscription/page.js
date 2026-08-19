"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "../lib/supabaseClient";

const EMPTY_CHILD = { firstName: "", lastName: "", classLevel: "" };

export default function DemandeInscriptionPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [children, setChildren] = useState([{ ...EMPTY_CHILD }]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

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

    const supabase = createClient();
    const { error: insertError } = await supabase.from("registration_requests").insert({
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      children: children.filter((c) => c.firstName && c.lastName),
      message,
    });

    if (insertError) {
      setError("Une erreur est survenue. Merci de réessayer ou de nous contacter directement.");
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <section className="max-w-xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-sou-blue mb-4">Demande envoyée</h1>
        <p className="text-slate-600">
          Merci ! Votre demande sera examinée par le bureau de l'association.
          Vous recevrez un e-mail avec un lien pour créer votre mot de passe
          dès que votre compte famille sera activé.
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-2xl mx-auto px-4 sm:px-6 py-14">
      <h1 className="text-3xl font-bold text-sou-blue mb-2">Demande d'accès à l'espace famille</h1>
      <p className="text-slate-600 mb-8">
        Les comptes famille sont normalement créés automatiquement en début
        d'année à partir des listes transmises par les écoles : vous recevez
        alors directement un e-mail pour créer votre mot de passe. Si ce
        n'est pas votre cas (nouvelle inscription en cours d'année, compte
        manquant...), utilisez ce formulaire : votre demande sera examinée
        par le bureau avant activation de votre compte.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <input required placeholder="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
          <input required placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
          <input required type="email" placeholder="Adresse e-mail" value={email} onChange={(e) => setEmail(e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
          <input placeholder="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sou-blue">Vos enfants scolarisés</p>
            <button type="button" onClick={addChild} className="text-sm text-sou-blue underline">
              + Ajouter un enfant
            </button>
          </div>
          {children.map((child, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-3 items-center">
              <input placeholder="Prénom de l'enfant" value={child.firstName} onChange={(e) => updateChild(i, "firstName", e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
              <input placeholder="Nom de l'enfant" value={child.lastName} onChange={(e) => updateChild(i, "lastName", e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
              <div className="flex gap-2">
                <input placeholder="Classe (ex: CE1)" value={child.classLevel} onChange={(e) => updateChild(i, "classLevel", e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2 flex-1" />
                {children.length > 1 && (
                  <button type="button" onClick={() => removeChild(i)} className="text-slate-400 hover:text-red-500 px-2" aria-label="Supprimer cet enfant">
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <textarea
          placeholder="Message (facultatif)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="w-full border border-slate-300 rounded-lg px-4 py-2"
        />

        {error && <p className="text-red-600 text-sm">{error}</p>}

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
