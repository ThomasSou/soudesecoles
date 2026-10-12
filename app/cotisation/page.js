"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "../components";

const TARIFS = [
  { id: "jaime", label: "J'aime", montant: 17 },
  { id: "passionnement", label: "Passionnément", montant: 20 },
  { id: "folie", label: "À la folie", montant: 25 },
];
const MONTANT_LIBRE_MIN = 17;

// Page publique de paiement de la cotisation, sans compte de connexion : pour
// les parents qui n'ont pas (encore) activé leur espace famille. On retrouve la
// famille par l'adresse e-mail, puis on redirige vers HelloAsso (qui refuse
// l'affichage en iframe). Le retour revient ici avec ?statut=retour&f=...
export default function CotisationPage() {
  const [email, setEmail] = useState("");
  const [choix, setChoix] = useState("passionnement");
  const [montantLibre, setMontantLibre] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  // formulaire | verification | payee | nonConfirmee | abandon
  const [etape, setEtape] = useState("formulaire");
  const [familleRetour, setFamilleRetour] = useState(null);

  const montant =
    choix === "libre" ? Number(montantLibre) || 0 : TARIFS.find((t) => t.id === choix)?.montant || 0;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const statut = params.get("statut");
    if (!statut) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (statut === "erreur") {
      setEtape("abandon");
    } else if (statut === "retour" && params.get("f")) {
      setFamilleRetour(params.get("f"));
      verifier(params.get("f"));
    }
  }, []);

  async function verifier(familyId) {
    setEtape("verification");
    try {
      const res = await fetch("/api/cotisation/confirmer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId }),
      });
      const d = await res.json();
      setEtape(d.paid ? "payee" : "nonConfirmee");
    } catch {
      setEtape("nonConfirmee");
    }
  }

  async function payer(e) {
    e.preventDefault();
    setErreur("");
    if (choix === "libre" && montant < MONTANT_LIBRE_MIN) {
      setErreur(`Le montant libre est de ${MONTANT_LIBRE_MIN} € minimum.`);
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch("/api/cotisation/payer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, amountEuros: montant }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Une erreur est survenue.");
      window.location.href = d.redirectUrl;
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Cotisation 2026-2027"
        subtitle="Adhérez au Sou des Écoles en ligne, en deux minutes, sans avoir besoin de créer de compte."
      />
      <section className="max-w-xl mx-auto px-4 sm:px-6 py-12">
        {etape === "verification" && (
          <p className="text-slate-600">Vérification de votre paiement auprès de HelloAsso...</p>
        )}

        {etape === "payee" && (
          <div className="text-center py-8">
            <p className="text-4xl mb-3">✅</p>
            <h2 className="text-xl font-bold text-sou-blue mb-2">Merci, votre cotisation est enregistrée !</h2>
            <p className="text-slate-600">
              Votre famille est maintenant adhérente du Sou des Écoles pour l&apos;année. Un reçu vous est
              envoyé par HelloAsso.
            </p>
          </div>
        )}

        {etape === "nonConfirmee" && (
          <div className="text-center py-8">
            <p className="text-4xl mb-3">⏳</p>
            <h2 className="text-xl font-bold text-sou-blue mb-2">Paiement pas encore confirmé</h2>
            <p className="text-slate-600 mb-4">
              Si vous venez de payer, cela ne prend que quelques secondes. Sinon, rien n&apos;a été encaissé.
            </p>
            <button
              onClick={() => familleRetour && verifier(familleRetour)}
              className="bg-sou-blue text-white text-sm font-semibold px-5 py-2 rounded-full"
            >
              Vérifier à nouveau
            </button>
            <p className="mt-4 text-sm">
              <button onClick={() => setEtape("formulaire")} className="text-slate-500 underline">
                Recommencer le paiement
              </button>
            </p>
          </div>
        )}

        {(etape === "formulaire" || etape === "abandon") && (
          <form onSubmit={payer} className="space-y-6">
            {etape === "abandon" && (
              <p className="text-sm text-red-600">
                Le paiement n&apos;a pas abouti : rien n&apos;a été encaissé. Vous pouvez réessayer.
              </p>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="email">
                Votre adresse e-mail
              </label>
              <input
                id="email"
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="celle où vous recevez nos e-mails"
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5"
              />
              <p className="text-xs text-slate-400 mt-1">
                Elle nous sert à retrouver votre famille. Aucun compte n&apos;est nécessaire.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Votre formule</p>
              <div className="grid sm:grid-cols-3 gap-3 mb-3">
                {TARIFS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setChoix(t.id)}
                    className={`border rounded-xl p-4 text-left transition-colors ${
                      choix === t.id ? "border-sou-blue bg-sou-blue/5" : "border-slate-200"
                    }`}
                  >
                    <p className="font-semibold text-slate-800">{t.label}</p>
                    <p className="text-sou-blue font-bold mt-1">{t.montant} €</p>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setChoix("libre")}
                className={`w-full border rounded-xl p-4 text-left transition-colors ${
                  choix === "libre" ? "border-sou-blue bg-sou-blue/5" : "border-slate-200"
                }`}
              >
                <p className="font-semibold text-slate-800">Montant libre</p>
                {choix === "libre" ? (
                  <input
                    type="number"
                    min={MONTANT_LIBRE_MIN}
                    step="1"
                    autoFocus
                    placeholder={`${MONTANT_LIBRE_MIN} € minimum`}
                    value={montantLibre}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setMontantLibre(e.target.value)}
                    className="mt-2 border border-slate-300 rounded-lg px-3 py-2 text-sm w-40"
                  />
                ) : (
                  <p className="text-slate-400 text-sm mt-1">À partir de {MONTANT_LIBRE_MIN} €</p>
                )}
              </button>
            </div>

            {erreur && <p className="text-sm text-red-600">{erreur}</p>}

            <div>
              <button
                type="submit"
                disabled={envoi}
                className="bg-sou-blue text-white font-semibold px-6 py-3 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-50"
              >
                {envoi ? "Préparation du paiement..." : `Payer ${montant ? montant + " €" : ""} par carte`}
              </button>
              <p className="text-xs text-slate-400 mt-2">
                Paiement sécurisé par HelloAsso. La cotisation est familiale : une seule par famille et par an.
              </p>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
