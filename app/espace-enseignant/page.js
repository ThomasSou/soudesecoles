"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabaseClient";

// ÉCHAFAUDAGE — espace enseignant / direction.
// Squelette fonctionnel : mes devis, mes factures, mes RIB, contact bureau.
// Voir docs/conception-espace-enseignants.md pour les décisions restantes
// (notamment : redirection par rôle après connexion, saisie libre des
// classes quand l'import de l'année n'a pas encore eu lieu).

const STATUTS_DEVIS = {
  soumis: { label: "Soumis", classe: "bg-amber-50 text-amber-700" },
  valide: { label: "Validé", classe: "bg-green-50 text-green-700" },
  refuse: { label: "Refusé", classe: "bg-red-50 text-red-700" },
};

const STATUTS_FACTURE = {
  soumise: { label: "Soumise", classe: "bg-amber-50 text-amber-700" },
  remboursee: { label: "Remboursée", classe: "bg-green-50 text-green-700" },
};

function euros(cents) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function dateCourte(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function fichierEnDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Sélecteur multi-classes. Si la liste dérivée des fiches enfants est vide
// (import de l'année pas encore fait), on bascule sur une saisie libre.
function SelecteurClasses({ classesConnues, valeur, onChange }) {
  const [libre, setLibre] = useState("");

  if (classesConnues.length === 0) {
    return (
      <div>
        <p className="text-xs text-slate-400 mb-1">
          Aucune classe enregistrée pour l&apos;année en cours (les fiches ne sont pas encore
          importées). Saisissez les classes concernées, séparées par des virgules.
        </p>
        <input
          value={libre}
          onChange={(e) => {
            setLibre(e.target.value);
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            );
          }}
          placeholder="Ex : CE1, CE2-CM1"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
    );
  }

  function bascule(classe) {
    onChange(
      valeur.includes(classe) ? valeur.filter((c) => c !== classe) : [...valeur, classe]
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {classesConnues.map((classe) => {
        const actif = valeur.includes(classe);
        return (
          <button
            key={classe}
            type="button"
            onClick={() => bascule(classe)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border ${
              actif ? "border-sou-blue bg-sou-blue text-white" : "border-slate-300 text-slate-600"
            }`}
          >
            {classe}
          </button>
        );
      })}
    </div>
  );
}

function BadgesClasses({ classes }) {
  if (!classes || classes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {classes.map((c) => (
        <span key={c} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
          {c}
        </span>
      ))}
    </div>
  );
}

function MesDevis({ token, classesConnues }) {
  const [devis, setDevis] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [classes, setClasses] = useState([]);
  const [file, setFile] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [succes, setSucces] = useState("");

  const recharger = useCallback(() => {
    fetch("/api/enseignant/devis", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setDevis(d.devis || []))
      .finally(() => setChargement(false));
  }, [token]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  async function envoyer(e) {
    e.preventDefault();
    setErreur("");
    setSucces("");
    if (!file) return setErreur("Joignez le devis (PDF ou photo).");
    if (!classes.length) return setErreur("Sélectionnez au moins une classe.");
    setEnvoi(true);
    try {
      const quoteFileDataUrl = await fichierEnDataUrl(file);
      const res = await fetch("/api/enseignant/devis", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, description, amount, classes, quoteFileDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
      setSucces("Devis envoyé. Le bureau va l'examiner.");
      setTitle("");
      setDescription("");
      setAmount("");
      setClasses([]);
      setFile(null);
      recharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-6">
      <h2 className="font-semibold text-sou-blue mb-1">Mes devis</h2>
      <p className="text-sm text-slate-500 mb-5">
        Déposez un devis de prestation que vous souhaitez faire financer par le Sou. Le bureau le
        valide ou le refuse.
      </p>

      <form onSubmit={envoyer} className="space-y-3 mb-6">
        <div>
          <label className="text-xs font-semibold text-slate-500">Intitulé</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex : Sortie au musée gallo-romain"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Détail (facultatif)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Montant du devis</label>
          <div className="relative w-32">
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-slate-300 rounded-lg pl-3 pr-7 py-2 text-sm"
            />
            <span className="absolute inset-y-0 right-3 flex items-center text-slate-400 text-sm">€</span>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">
            Classe(s) concernée(s) — obligatoire
          </label>
          <SelecteurClasses classesConnues={classesConnues} valeur={classes} onChange={setClasses} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Devis (PDF ou photo)</label>
          <input
            required
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm"
          />
        </div>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        {succes && <p className="text-sm text-green-700">{succes}</p>}
        <button
          type="submit"
          disabled={envoi}
          className="bg-sou-blue text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-50"
        >
          {envoi ? "Envoi..." : "Envoyer le devis"}
        </button>
      </form>

      <div className="pt-4 border-t border-slate-100">
        <p className="text-sm font-medium text-slate-600 mb-2">Historique</p>
        {chargement ? (
          <p className="text-slate-500 text-sm">Chargement...</p>
        ) : devis.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucun devis pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {devis.map((d) => {
              const statut = STATUTS_DEVIS[d.status] || STATUTS_DEVIS.soumis;
              return (
                <li key={d.id} className="py-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="text-slate-700">{d.title}</p>
                      {d.description && <p className="text-slate-400 text-xs">{d.description}</p>}
                      <BadgesClasses classes={d.classes} />
                      <p className="text-slate-400 text-xs mt-0.5">{dateCourte(d.created_at)}</p>
                      {d.status === "refuse" && d.admin_note && (
                        <p className="text-red-600 text-xs mt-1">Motif : {d.admin_note}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-medium text-slate-700">{euros(d.amount_cents)}</p>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statut.classe}`}>
                        {statut.label}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function MesFactures({ token, classesConnues }) {
  const [factures, setFactures] = useState([]);
  const [ribs, setRibs] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [label, setLabel] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [amount, setAmount] = useState("");
  const [classes, setClasses] = useState([]);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [ribChoice, setRibChoice] = useState("aucun"); // aucun | nouveau | <ribId>
  const [ribFile, setRibFile] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [succes, setSucces] = useState("");

  const recharger = useCallback(() => {
    Promise.all([
      fetch("/api/enseignant/factures", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch("/api/enseignant/rib", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ])
      .then(([f, r]) => {
        setFactures(f.factures || []);
        setRibs(r.ribs || []);
      })
      .finally(() => setChargement(false));
  }, [token]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  async function envoyer(e) {
    e.preventDefault();
    setErreur("");
    setSucces("");
    if (!invoiceFile) return setErreur("Joignez la facture (PDF ou photo).");
    if (!classes.length) return setErreur("Sélectionnez au moins une classe.");
    setEnvoi(true);
    try {
      const invoiceFileDataUrl = await fichierEnDataUrl(invoiceFile);
      const ribFileDataUrl =
        ribChoice === "nouveau" && ribFile ? await fichierEnDataUrl(ribFile) : null;
      const ribId = ribChoice !== "aucun" && ribChoice !== "nouveau" ? ribChoice : null;

      const res = await fetch("/api/enseignant/factures", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          label,
          supplierName,
          amount,
          classes,
          invoiceFileDataUrl,
          ribFileDataUrl,
          ribId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
      setSucces("Facture envoyée.");
      setLabel("");
      setSupplierName("");
      setAmount("");
      setClasses([]);
      setInvoiceFile(null);
      setRibChoice("aucun");
      setRibFile(null);
      recharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-6">
      <h2 className="font-semibold text-sou-blue mb-1">Mes factures</h2>
      <p className="text-sm text-slate-500 mb-5">
        Déposez une facture de prestataire à faire rembourser par le Sou. Pas besoin de devis
        préalable. Joignez un RIB (fichier) pour le virement.
      </p>

      <form onSubmit={envoyer} className="space-y-3 mb-6">
        <div>
          <label className="text-xs font-semibold text-slate-500">Intitulé</label>
          <input
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex : Car — sortie piscine"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Prestataire (facultatif)</label>
          <input
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Montant de la facture</label>
          <div className="relative w-32">
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-slate-300 rounded-lg pl-3 pr-7 py-2 text-sm"
            />
            <span className="absolute inset-y-0 right-3 flex items-center text-slate-400 text-sm">€</span>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">
            Classe(s) concernée(s) — obligatoire
          </label>
          <SelecteurClasses classesConnues={classesConnues} valeur={classes} onChange={setClasses} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Facture (PDF ou photo)</label>
          <input
            required
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
            className="block w-full text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">RIB pour le virement</label>
          <select
            value={ribChoice}
            onChange={(e) => setRibChoice(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="aucun">Aucun pour l&apos;instant</option>
            <option value="nouveau">Déposer un nouveau RIB (fichier)</option>
            {ribs.map((r) => (
              <option key={r.id} value={r.id}>
                Réutiliser : {r.label || `RIB du ${dateCourte(r.created_at)}`}
              </option>
            ))}
          </select>
          {ribChoice === "nouveau" && (
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setRibFile(e.target.files?.[0] || null)}
              className="block w-full text-sm mt-2"
            />
          )}
        </div>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        {succes && <p className="text-sm text-green-700">{succes}</p>}
        <button
          type="submit"
          disabled={envoi}
          className="bg-sou-blue text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-50"
        >
          {envoi ? "Envoi..." : "Envoyer la facture"}
        </button>
      </form>

      <div className="pt-4 border-t border-slate-100">
        <p className="text-sm font-medium text-slate-600 mb-2">Historique</p>
        {chargement ? (
          <p className="text-slate-500 text-sm">Chargement...</p>
        ) : factures.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucune facture pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {factures.map((f) => {
              const statut = STATUTS_FACTURE[f.status] || STATUTS_FACTURE.soumise;
              return (
                <li key={f.id} className="py-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="text-slate-700">{f.label}</p>
                      {f.supplier_name && (
                        <p className="text-slate-400 text-xs">{f.supplier_name}</p>
                      )}
                      <BadgesClasses classes={f.classes} />
                      <p className="text-slate-400 text-xs mt-0.5">
                        {dateCourte(f.created_at)}
                        {f.a_rib ? " — RIB joint" : " — RIB manquant"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-medium text-slate-700">{euros(f.amount_cents)}</p>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statut.classe}`}>
                        {statut.label}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function MesRibs({ token }) {
  const [ribs, setRibs] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  const recharger = useCallback(() => {
    fetch("/api/enseignant/rib", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setRibs(d.ribs || []))
      .finally(() => setChargement(false));
  }, [token]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  async function envoyer(e) {
    e.preventDefault();
    setErreur("");
    if (!file) return setErreur("Choisissez un fichier RIB (PDF ou photo).");
    setEnvoi(true);
    try {
      const ribFileDataUrl = await fichierEnDataUrl(file);
      const res = await fetch("/api/enseignant/rib", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label, ribFileDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
      setLabel("");
      setFile(null);
      recharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-6">
      <h2 className="font-semibold text-sou-blue mb-1">Mes RIB</h2>
      <p className="text-sm text-slate-500 mb-5">
        Déposez un RIB en fichier (PDF ou photo). Aucune saisie d&apos;IBAN : cela évite les erreurs
        de frappe. Vous pourrez ensuite le rattacher à une facture.
      </p>

      <form onSubmit={envoyer} className="space-y-3 mb-6">
        <div>
          <label className="text-xs font-semibold text-slate-500">Libellé (facultatif)</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex : Coopérative CE2, compte perso..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Fichier RIB</label>
          <input
            required
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm"
          />
        </div>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <button
          type="submit"
          disabled={envoi}
          className="bg-sou-blue text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-50"
        >
          {envoi ? "Envoi..." : "Déposer le RIB"}
        </button>
      </form>

      <div className="pt-4 border-t border-slate-100">
        {chargement ? (
          <p className="text-slate-500 text-sm">Chargement...</p>
        ) : ribs.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucun RIB déposé.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {ribs.map((r) => (
              <li key={r.id} className="py-2 flex justify-between text-sm">
                <span className="text-slate-700">{r.label || "RIB"}</span>
                <span className="text-slate-400 text-xs">{dateCourte(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ContactBureau({ token }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [succes, setSucces] = useState("");

  async function envoyer(e) {
    e.preventDefault();
    setErreur("");
    setSucces("");
    if (!message.trim()) return setErreur("Écrivez un message.");
    setEnvoi(true);
    try {
      const res = await fetch("/api/enseignant/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
      setSucces("Message envoyé au bureau.");
      setSubject("");
      setMessage("");
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-6">
      <h2 className="font-semibold text-sou-blue mb-1">Écrire au bureau</h2>
      <p className="text-sm text-slate-500 mb-5">
        Votre message arrive dans « Messages reçus » du bureau, identifié comme venant de
        l&apos;espace enseignant.
      </p>
      <form onSubmit={envoyer} className="space-y-3">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Sujet (facultatif)"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <textarea
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="Votre message"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        {succes && <p className="text-sm text-green-700">{succes}</p>}
        <button
          type="submit"
          disabled={envoi}
          className="bg-sou-blue text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-50"
        >
          {envoi ? "Envoi..." : "Envoyer"}
        </button>
      </form>
    </div>
  );
}

export default function EspaceEnseignantPage() {
  const router = useRouter();
  const [etat, setEtat] = useState("chargement"); // chargement | refuse | ok
  const [token, setToken] = useState(null);
  const [enseignant, setEnseignant] = useState(null);
  const [classesConnues, setClassesConnues] = useState([]);

  useEffect(() => {
    const supabase = createClient();
    async function charger() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/connexion");
        return;
      }
      const res = await fetch("/api/enseignant/moi", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setEtat("refuse");
        return;
      }
      const data = await res.json();
      setEnseignant(data.enseignant);
      setToken(session.access_token);

      fetch("/api/enseignant/classes", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((r) => r.json())
        .then((d) => setClassesConnues(d.classes || []))
        .catch(() => setClassesConnues([]));

      setEtat("ok");
    }
    charger();
  }, [router]);

  async function seDeconnecter() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/connexion");
  }

  if (etat === "chargement") {
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center text-slate-500">
        Chargement de votre espace...
      </section>
    );
  }

  if (etat === "refuse") {
    return (
      <section className="max-w-md mx-auto px-4 sm:px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-sou-blue mb-3">Accès réservé</h1>
        <p className="text-slate-600">
          Cet espace est réservé aux enseignants et à la direction. Si vous êtes une famille,
          rendez-vous sur votre <a href="/espace-adherent" className="text-sou-blue underline">espace famille</a>.
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-sou-blue">Espace enseignant</h1>
          <p className="text-sm text-slate-500">
            {enseignant?.firstName} {enseignant?.lastName}
            {enseignant?.role === "direction" ? " — Direction" : ""}
          </p>
        </div>
        <button
          onClick={seDeconnecter}
          className="text-sm text-slate-500 hover:text-sou-blue underline"
        >
          Se déconnecter
        </button>
      </div>

      <div className="space-y-8">
        <MesDevis token={token} classesConnues={classesConnues} />
        <MesFactures token={token} classesConnues={classesConnues} />
        <MesRibs token={token} />
        <ContactBureau token={token} />
      </div>
    </section>
  );
}
