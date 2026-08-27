"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components";
import { createClient } from "../lib/supabaseClient";

function formatCreneau(debut, fin) {
  const d = new Date(debut);
  const f = new Date(fin);
  const jour = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const heureDebut = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const heureFin = f.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${jour} — ${heureDebut} à ${heureFin}`;
}

// Un atelier a toujours lieu sur une seule journée : on affiche cette date
// une fois au-dessus de la liste, plutôt que de la répéter sur chaque ligne
// de créneau (qui n'a alors plus besoin d'indiquer que l'horaire).
function formatJour(debut) {
  const jour = new Date(debut).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return jour.charAt(0).toUpperCase() + jour.slice(1);
}

function formatHeures(debut, fin) {
  const heureDebut = new Date(debut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const heureFin = new Date(fin).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${heureDebut} à ${heureFin}`;
}

export default function BenevolesPage() {
  const [evenements, setEvenements] = useState([]);
  const [evenementActifId, setEvenementActifId] = useState(null);
  const [selection, setSelection] = useState([]); // [creneauId]
  const [contact, setContact] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [connecte, setConnecte] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [etape, setEtape] = useState("planning"); // planning | confirme
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [chargement, setChargement] = useState(true);

  function chargerPlanning() {
    return fetch("/api/benevoles/planning")
      .then((r) => r.json())
      .then((d) => {
        const liste = d.evenements || [];
        setEvenements(liste);
        setEvenementActifId((courant) => courant || liste[0]?.id || null);
        setChargement(false);
      });
  }

  useEffect(() => {
    chargerPlanning();

    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      setAccessToken(session.access_token);
      const res = await fetch("/api/benevoles/moi", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.parent) {
        setConnecte(true);
        setContact({
          firstName: data.parent.firstName || "",
          lastName: data.parent.lastName || "",
          email: data.parent.email || "",
          phone: data.parent.phone || "",
        });
      }
    })();
  }, []);

  const evenementActif = evenements.find((e) => e.id === evenementActifId) || null;

  const creneauxParId = useMemo(() => {
    const map = new Map();
    for (const e of evenements) {
      for (const a of e.ateliers) {
        for (const c of a.creneaux) map.set(c.id, { ...c, atelierNom: a.nom });
      }
    }
    return map;
  }, [evenements]);

  function basculer(creneauId) {
    setSelection((prev) =>
      prev.includes(creneauId) ? prev.filter((id) => id !== creneauId) : [...prev, creneauId]
    );
  }

  async function sInscrire(e) {
    e.preventDefault();
    setErreur("");
    if (selection.length === 0) {
      setErreur("Choisissez au moins un créneau.");
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch("/api/benevoles/inscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ creneauIds: selection, ...contact }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
      setEtape("confirme");
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  if (chargement) {
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center text-slate-500">
        Chargement du planning...
      </section>
    );
  }

  return (
    <>
      <PageHeader
        title="Créneaux bénévoles"
        subtitle="Le Sou des Écoles ne tourne que grâce à vous ! Choisissez un ou plusieurs créneaux pour donner un coup de main."
      />

      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        {evenements.length === 0 ? (
          <p className="text-slate-500 text-center">
            Aucun appel à bénévoles n&apos;est ouvert pour le moment.
          </p>
        ) : etape === "confirme" ? (
          <div className="max-w-md mx-auto text-center py-12">
            <p className="text-3xl mb-3">✅</p>
            <h2 className="text-xl font-bold text-sou-blue mb-2">Merci {contact.firstName} !</h2>
            <p className="text-slate-600">
              Votre inscription sur {selection.length} créneau{selection.length > 1 ? "x" : ""} a bien été
              enregistrée. À bientôt !
            </p>
            <button
              onClick={() => {
                setSelection([]);
                setEtape("planning");
                chargerPlanning();
              }}
              className="inline-block mt-6 text-sou-blue underline text-sm"
            >
              ← Retour au planning
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 space-y-6">
              {evenements.length > 1 && (
                <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
                  {evenements.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setEvenementActifId(e.id)}
                      className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                        evenementActifId === e.id
                          ? "bg-sou-blue text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {e.nom}
                    </button>
                  ))}
                </div>
              )}

              {evenementActif?.ateliers.length === 0 ? (
                <p className="text-slate-500">Aucun créneau disponible pour le moment.</p>
              ) : (
                <div className="space-y-8">
                  {evenementActif?.ateliers.map((atelier) => (
                    <div key={atelier.id}>
                      <h2 className="text-lg font-bold text-sou-blue mb-1">{atelier.nom}</h2>
                      {atelier.description && (
                        <p className="text-sm text-slate-500 mb-1">{atelier.description}</p>
                      )}
                      {atelier.creneaux[0] && (
                        <p className="text-sm font-semibold text-slate-700 mb-3">
                          {formatJour(atelier.creneaux[0].debut)}
                        </p>
                      )}
                      <div className="space-y-2">
                        {atelier.creneaux.map((c) => {
                          const complet = c.placesRestantes <= 0;
                          const coche = selection.includes(c.id);
                          return (
                            <label
                              key={c.id}
                              className={`flex flex-col gap-1.5 border rounded-xl p-3 text-sm ${
                                complet
                                  ? "border-slate-200 bg-slate-50 text-slate-400"
                                  : coche
                                  ? "border-sou-blue bg-sou-blue/5"
                                  : "border-slate-200 hover:border-sou-blue/50 cursor-pointer"
                              }`}
                            >
                              <span className="flex items-center justify-between gap-4">
                                <span className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    disabled={complet}
                                    checked={coche}
                                    onChange={() => basculer(c.id)}
                                  />
                                  {c.nom && <span className="font-semibold">{c.nom} — </span>}
                                  {formatHeures(c.debut, c.fin)}
                                </span>
                                <span
                                  className={`whitespace-nowrap text-xs font-semibold px-2 py-1 rounded-full ${
                                    complet ? "bg-slate-200 text-slate-500" : "bg-green-50 text-green-700"
                                  }`}
                                >
                                  {complet ? "Complet" : `${c.placesRestantes} place${c.placesRestantes > 1 ? "s" : ""}`}
                                </span>
                              </span>
                              {c.inscrits.length > 0 && (
                                <span className="text-xs text-slate-400 pl-7">
                                  Déjà inscrit·e{c.inscrits.length > 1 ? "s" : ""} : {c.inscrits.join(", ")}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="border border-slate-200 rounded-xl p-5 sticky top-24">
                <h3 className="font-bold text-slate-800 mb-3">Vos créneaux</h3>
                {selection.length === 0 ? (
                  <p className="text-sm text-slate-500 mb-4">Sélectionnez un ou plusieurs créneaux.</p>
                ) : (
                  <ul className="space-y-1 mb-4 text-sm text-slate-600">
                    {selection.map((id) => {
                      const c = creneauxParId.get(id);
                      if (!c) return null;
                      return (
                        <li key={id} className="flex justify-between gap-2">
                          <span>
                            {c.atelierNom}
                            {c.nom ? ` (${c.nom})` : ""} — {formatCreneau(c.debut, c.fin)}
                          </span>
                          <button
                            type="button"
                            onClick={() => basculer(id)}
                            className="text-red-500 shrink-0"
                            aria-label="Retirer"
                          >
                            ✕
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {selection.length > 0 && !connecte && (
                  <p className="text-xs text-slate-500 mb-2">
                    <a href="/connexion" className="text-sou-blue underline">
                      Connectez-vous
                    </a>{" "}
                    pour retrouver l&apos;historique de votre aide dans votre espace famille (facultatif).
                  </p>
                )}
                {selection.length > 0 && (
                  <form onSubmit={sInscrire} className="space-y-2">
                    <input
                      required
                      placeholder="Prénom"
                      value={contact.firstName}
                      onChange={(e) => setContact({ ...contact, firstName: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      required
                      placeholder="Nom"
                      value={contact.lastName}
                      onChange={(e) => setContact({ ...contact, lastName: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      required
                      type="email"
                      placeholder="E-mail"
                      value={contact.email}
                      onChange={(e) => setContact({ ...contact, email: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      required
                      type="tel"
                      placeholder="Téléphone"
                      value={contact.phone}
                      onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                    {erreur && <p className="text-sm text-red-600">{erreur}</p>}
                    <button
                      type="submit"
                      disabled={envoi}
                      className="w-full bg-sou-blue text-white font-semibold py-2.5 rounded-full disabled:opacity-50"
                    >
                      {envoi ? "Envoi..." : "Je m'inscris"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
