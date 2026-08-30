"use client";

// ESPACE PARTENAIRE — version compte e-mail / mot de passe (même
// authentification Supabase que l'espace famille). Remplace l'ancienne
// version à code PIN. Le PIN reste utilisé UNIQUEMENT pour valider un
// avantage au comptoir depuis /verifier-adhesion/[token] (voir les routes
// /api/partenaire/valider et /api/partenaire/pour-famille, inchangées).
//
// ÉCHAFAUDAGE : squelette fonctionnel, à affiner (états de chargement,
// messages d'erreur détaillés, accessibilité).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabaseClient";

function euros(cents) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
function dateFr(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
function fichierEnDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const STATUT_MESSAGE = {
  brouillon: "Brouillon",
  soumis: "En attente de validation",
  valide: "Validé",
  refuse: "Refusé",
  publie: "Publié",
};

// --- Messages « nouveautés » -----------------------------------------
function MesMessagesNouveautes({ accessToken }) {
  const [data, setData] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const [titre, setTitre] = useState("");
  const [texte, setTexte] = useState("");
  const [lien, setLien] = useState("");
  const [image, setImage] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  const recharger = useCallback(() => {
    return fetch("/api/partenaire/messages", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  async function soumettre(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      const imageDataUrl = image ? await fichierEnDataUrl(image) : null;
      const res = await fetch("/api/partenaire/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ type: "email", titre, texte, lien, imageDataUrl, soumettre: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Une erreur est survenue.");
      setTitre(""); setTexte(""); setLien(""); setImage(null); setOuvert(false);
      recharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  if (!data) return <p className="text-slate-500 text-sm">Chargement...</p>;

  const q = data.quota || {};
  const peutSoumettre = (q.restantEmail ?? 0) > 0;

  return (
    <div>
      <p className="text-sm text-slate-500 mb-4">
        Proposez une actualité (promo, nouveauté, événement) : après validation par le bureau, elle
        paraîtra dans l&apos;e-mail mensuel « Les nouveautés de nos partenaires » envoyé aux familles.
        {q.libelleNiveau
          ? ` Niveau ${q.libelleNiveau} : ${q.quotaEmail} message(s) / mois — ${q.restantEmail} restant(s) pour ${q.moisCible}.`
          : " Aucune période de partenariat active : soumission indisponible."}
      </p>

      {!ouvert ? (
        <button
          onClick={() => setOuvert(true)}
          disabled={!peutSoumettre}
          className="bg-sou-blue text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-50"
        >
          + Rédiger un message
        </button>
      ) : (
        <form onSubmit={soumettre} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
          <label className="block text-sm">
            <span className="text-xs font-semibold text-slate-500">Titre</span>
            <input required value={titre} onChange={(e) => setTitre(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-semibold text-slate-500">Texte</span>
            <textarea required rows={4} value={texte} onChange={(e) => setTexte(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-semibold text-slate-500">Lien (facultatif)</span>
            <input value={lien} onChange={(e) => setLien(e.target.value)} placeholder="https://..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-semibold text-slate-500">Image (facultatif, 10 Mo max)</span>
            <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] || null)}
              className="block w-full text-sm" />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={envoi}
              className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50">
              {envoi ? "Envoi..." : "Soumettre au bureau"}
            </button>
            <button type="button" onClick={() => setOuvert(false)} className="text-sm text-slate-500 px-4 py-2">
              Annuler
            </button>
          </div>
        </form>
      )}

      {data.messages?.length > 0 && (
        <ul className="divide-y divide-slate-100 mt-4">
          {data.messages.map((m) => (
            <li key={m.id} className="py-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-700">{m.titre}</span>
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  {STATUT_MESSAGE[m.statut] || m.statut}
                  {m.mois_cible ? ` · ${m.mois_cible}` : ""}
                </span>
              </div>
              {m.statut === "refuse" && m.motif_refus && (
                <p className="text-xs text-red-600">Motif : {m.motif_refus}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Avantages : création + édition par le partenaire lui-même --------
function NouvelAvantage({ accessToken, onCree }) {
  const [ouvert, setOuvert] = useState(false);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [quantite, setQuantite] = useState("1");
  const [requiresMembership, setRequiresMembership] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  async function creer(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      const res = await fetch("/api/partenaire/mes-avantages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          label,
          description,
          quantiteParFamille: quantite,
          requiresMembership,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
      setLabel(""); setDescription(""); setQuantite("1"); setRequiresMembership(true);
      setOuvert(false);
      onCree(data.avantage);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="bg-sou-blue text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-sou-gold transition-colors"
      >
        + Nouvel avantage
      </button>
    );
  }

  return (
    <form onSubmit={creer} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <label className="block text-sm">
        <span className="text-xs font-semibold text-slate-500">Avantage proposé</span>
        <input required value={label} onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex : -10 % sur l'addition"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
      </label>
      <label className="block text-sm">
        <span className="text-xs font-semibold text-slate-500">Précisions (facultatif)</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
      </label>
      <label className="block text-sm">
        <span className="text-xs font-semibold text-slate-500">Quantité offerte par famille</span>
        <input required type="number" min="1" value={quantite} onChange={(e) => setQuantite(e.target.value)}
          className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={requiresMembership}
          onChange={(e) => setRequiresMembership(e.target.checked)} />
        Réservé aux familles à jour de cotisation
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={envoi}
          className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50">
          {envoi ? "Création..." : "Publier l'avantage"}
        </button>
        <button type="button" onClick={() => setOuvert(false)} className="text-sm text-slate-500 px-4 py-2">
          Annuler
        </button>
      </div>
      <p className="text-xs text-slate-400">
        Votre avantage est publié immédiatement, sans validation du bureau.
      </p>
    </form>
  );
}

function LigneAvantage({ accessToken, avantage, onMaj }) {
  const [envoi, setEnvoi] = useState(false);
  const [edition, setEdition] = useState(false);
  const [label, setLabel] = useState(avantage.label);
  const [quantite, setQuantite] = useState(avantage.limite);

  async function patch(body) {
    setEnvoi(true);
    try {
      const res = await fetch(`/api/partenaire/mes-avantages/${avantage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) onMaj(data.avantage);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1">
          {edition ? (
            <div className="space-y-2">
              <input value={label} onChange={(e) => setLabel(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
              <label className="text-xs text-slate-500 block">
                Quantité par famille{" "}
                <input type="number" min="1" value={quantite} onChange={(e) => setQuantite(e.target.value)}
                  className="w-16 border border-slate-300 rounded px-2 py-0.5 text-sm" />
              </label>
              <div className="flex gap-2">
                <button
                  onClick={async () => { await patch({ label, quantiteParFamille: quantite }); setEdition(false); }}
                  disabled={envoi}
                  className="text-sm text-sou-blue underline">
                  Enregistrer
                </button>
                <button onClick={() => setEdition(false)} className="text-sm text-slate-400 underline">
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="font-semibold text-slate-800">{avantage.label}</p>
              {avantage.description && <p className="text-xs text-slate-500">{avantage.description}</p>}
              <p className="text-xs text-slate-500 mt-1">
                {avantage.limite} par famille ·{" "}
                {avantage.requiert_adhesion ? "réservé aux adhérents à jour" : "ouvert à tous"} ·{" "}
                {avantage.utilisations} utilisation{avantage.utilisations > 1 ? "s" : ""}
              </p>
            </>
          )}
        </div>
        {!edition && (
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${avantage.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
              {avantage.active ? "En ligne" : "Masqué"}
            </span>
            <button onClick={() => setEdition(true)} className="text-sm text-sou-blue underline">
              Modifier
            </button>
            <button onClick={() => patch({ active: !avantage.active })} disabled={envoi}
              className="text-sm text-slate-500 underline disabled:opacity-50">
              {avantage.active ? "Masquer" : "Remettre en ligne"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Contact -------------------------------------------------------
function ContactPartenaire({ accessToken }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState("");

  async function envoyer(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      const res = await fetch("/api/partenaire/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ subject, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
      setEnvoye(true);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  if (envoye) {
    return <p className="text-green-700 text-sm">Message envoyé au bureau. Réponse par e-mail.</p>;
  }

  return (
    <form onSubmit={envoyer} className="space-y-3">
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Sujet"
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
      <textarea required rows={4} value={message} onChange={(e) => setMessage(e.target.value)}
        placeholder="Votre message"
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
      <button disabled={envoi}
        className="bg-sou-blue text-white text-sm font-semibold px-5 py-2.5 rounded-full disabled:opacity-50">
        {envoi ? "Envoi..." : "Envoyer"}
      </button>
    </form>
  );
}

export default function PartenairePage() {
  const router = useRouter();
  const [etat, setEtat] = useState("chargement"); // chargement | connecte | refuse | anonyme
  const [accessToken, setAccessToken] = useState(null);
  const [data, setData] = useState(null);

  const charger = useCallback(async (token) => {
    const res = await fetch("/api/partenaire/moi", { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      setEtat("anonyme");
      return;
    }
    if (!res.ok) {
      setEtat("refuse");
      return;
    }
    setData(await res.json());
    setEtat("connecte");
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setEtat("anonyme");
        return;
      }
      setAccessToken(session.access_token);
      charger(session.access_token);
    });
  }, [charger]);

  async function seDeconnecter() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/connexion");
  }

  if (etat === "chargement") {
    return <section className="max-w-3xl mx-auto px-4 py-20 text-center text-slate-500">Chargement...</section>;
  }

  if (etat === "anonyme") {
    return (
      <section className="max-w-md mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-sou-blue mb-3">Espace partenaire</h1>
        <p className="text-slate-600 mb-6">
          Connectez-vous avec l&apos;adresse e-mail et le mot de passe communiqués par le Sou des Écoles.
        </p>
        <a href="/connexion" className="inline-block bg-sou-blue text-white font-semibold px-6 py-3 rounded-full">
          Se connecter
        </a>
      </section>
    );
  }

  if (etat === "refuse") {
    return (
      <section className="max-w-md mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-sou-blue mb-3">Accès réservé</h1>
        <p className="text-slate-600 mb-6">
          Ce compte n&apos;est pas rattaché à un partenaire. Si vous êtes une famille adhérente,
          rendez-vous sur votre espace.
        </p>
        <a href="/espace-adherent" className="text-sou-blue underline">Mon espace famille</a>
      </section>
    );
  }

  const { partenaire, aJour, periodeCourante, paiements, avantages, documents } = data;
  const totalEncaisse = paiements.reduce((s, p) => s + p.montant_cents, 0);

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-sou-blue">Espace partenaire</h1>
        <button onClick={seDeconnecter} className="text-sm text-slate-500 underline hover:text-sou-blue">
          Se déconnecter
        </button>
      </div>

      <div className="space-y-8">
        <div className="border border-slate-200 rounded-xl p-6">
          <h2 className="font-semibold text-sou-blue mb-2">{partenaire.nom}</h2>
          {aJour ? (
            <p className="text-green-700 font-medium text-sm">
              ✓ Partenariat à jour
              {data.niveauLibelle ? ` — niveau ${data.niveauLibelle}` : ""}
              {periodeCourante ? ` (jusqu'au ${dateFr(periodeCourante.fin)})` : ""}
            </p>
          ) : (
            <p className="text-slate-600 text-sm">
              Aucune période de partenariat en cours. Contactez le bureau pour la renouveler.
            </p>
          )}
          {data.niveauContreparties && (
            <p className="text-xs text-slate-500 mt-2">{data.niveauContreparties}</p>
          )}
        </div>

        <div className="border border-slate-200 rounded-xl p-6">
          <h2 className="font-semibold text-sou-blue mb-3">Mes versements</h2>
          {paiements.length === 0 ? (
            <p className="text-slate-500 text-sm">Aucun versement enregistré pour le moment.</p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {paiements.map((p) => (
                  <li key={p.id} className="py-2 flex justify-between text-sm">
                    <span className="text-slate-700">
                      {dateFr(p.recu_le)}
                      {p.reference ? ` — ${p.reference}` : ""}
                    </span>
                    <span className="font-medium text-slate-700">{euros(p.montant_cents)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between pt-3 mt-1 border-t border-slate-200 text-sm font-semibold text-sou-blue">
                <span>Total</span>
                <span>{euros(totalEncaisse)}</span>
              </div>
            </>
          )}
          <p className="text-xs text-slate-400 mt-3">
            Historique tenu par le bureau. Une erreur ? Signalez-la via le formulaire ci-dessous.
          </p>
        </div>

        <div className="border border-slate-200 rounded-xl p-6">
          <h2 className="font-semibold text-sou-blue mb-1">Les avantages que j&apos;offre</h2>
          <p className="text-sm text-slate-500 mb-4">
            Vous gérez librement vos avantages. Toute modification est visible immédiatement sur la
            carte des familles adhérentes.
          </p>
          <div className="space-y-3">
            <NouvelAvantage
              accessToken={accessToken}
              onCree={(a) => setData((d) => ({ ...d, avantages: [a, ...d.avantages] }))}
            />
            {avantages.length === 0 ? (
              <p className="text-slate-500 text-sm">Vous n&apos;avez pas encore créé d&apos;avantage.</p>
            ) : (
              avantages.map((a) => (
                <LigneAvantage
                  key={a.id}
                  accessToken={accessToken}
                  avantage={a}
                  onMaj={(maj) =>
                    setData((d) => ({
                      ...d,
                      avantages: d.avantages.map((x) => (x.id === maj.id ? { ...x, ...maj } : x)),
                    }))
                  }
                />
              ))
            )}
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl p-6">
          <h2 className="font-semibold text-sou-blue mb-3">Documents partagés par le bureau</h2>
          {documents.length === 0 ? (
            <p className="text-slate-500 text-sm">Aucun document pour le moment.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {documents.map((doc) => (
                <li key={doc.id} className="py-2 flex justify-between items-center gap-3 text-sm">
                  <span className="text-slate-700">
                    {doc.titre}
                    {doc.description ? ` — ${doc.description}` : ""}
                    <span className="text-xs text-slate-400"> · {dateFr(doc.depose_le)}</span>
                  </span>
                  <button
                    onClick={async () => {
                      const res = await fetch(`/api/partenaire/documents/${doc.id}`, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                      });
                      const d = await res.json();
                      if (res.ok) window.open(d.url, "_blank", "noopener,noreferrer");
                    }}
                    className="text-sou-blue underline shrink-0"
                  >
                    Télécharger
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border border-slate-200 rounded-xl p-6">
          <h2 className="font-semibold text-sou-blue mb-1">Mes messages « nouveautés »</h2>
          <MesMessagesNouveautes accessToken={accessToken} />
        </div>

        <div className="border border-slate-200 rounded-xl p-6">
          <h2 className="font-semibold text-sou-blue mb-1">Contacter le bureau</h2>
          <p className="text-sm text-slate-500 mb-4">
            Votre message arrive dans la messagerie du Sou des Écoles, identifié comme venant de vous.
          </p>
          <ContactPartenaire accessToken={accessToken} />
        </div>
      </div>
    </section>
  );
}
