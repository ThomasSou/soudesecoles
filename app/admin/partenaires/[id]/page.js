"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AdminShell from "../../admin-shell";

function euros(cents) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
function dateFr(iso) {
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

const MOYENS = {
  virement: "Virement",
  cheque: "Chèque",
  especes: "Espèces",
  autre: "Autre",
};

// --- Section : coordonnées + compte -----------------------------------
function SectionCoordonnees({ accessToken, partenaire, onMaj }) {
  const [form, setForm] = useState(() => ({
    nom: partenaire.nom || "",
    email: partenaire.email || "",
    contactNom: partenaire.contact_nom || "",
    telephone: partenaire.telephone || "",
    adresse: partenaire.adresse || "",
    codePostal: partenaire.code_postal || "",
    ville: partenaire.ville || "",
    siteWeb: partenaire.site_web || "",
    notes: partenaire.notes || "",
  }));
  const [envoi, setEnvoi] = useState(false);
  const [msg, setMsg] = useState("");

  function maj(champ, v) {
    setForm((f) => ({ ...f, [champ]: v }));
  }

  async function enregistrer() {
    setEnvoi(true);
    setMsg("");
    const res = await fetch(`/api/admin/partenaires/${partenaire.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setEnvoi(false);
    if (res.ok) {
      onMaj(data.partenaire);
      setMsg("Enregistré.");
    } else {
      setMsg(data.error || "Erreur.");
    }
  }

  async function inviter() {
    setMsg("");
    const res = await fetch(`/api/admin/partenaires/${partenaire.id}/inviter`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    setMsg(res.ok ? "Invitation envoyée." : data.error || "Erreur.");
  }

  async function basculerActif() {
    const res = await fetch(`/api/admin/partenaires/${partenaire.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ active: !partenaire.active }),
    });
    const data = await res.json();
    if (res.ok) onMaj(data.partenaire);
  }

  async function regenererPin() {
    const res = await fetch(`/api/admin/partenaires/${partenaire.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ regeneratePin: true }),
    });
    const data = await res.json();
    if (res.ok) onMaj(data.partenaire);
  }

  return (
    <div className="border border-slate-200 rounded-xl p-5">
      <h2 className="font-semibold text-sou-blue mb-3">Coordonnées</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["nom", "Nom du partenaire"],
          ["email", "E-mail"],
          ["contactNom", "Personne référente"],
          ["telephone", "Téléphone"],
          ["adresse", "Adresse"],
          ["codePostal", "Code postal"],
          ["ville", "Ville"],
          ["siteWeb", "Site web"],
        ].map(([champ, label]) => (
          <label key={champ} className="text-sm">
            <span className="text-xs font-semibold text-slate-500">{label}</span>
            <input
              value={form[champ]}
              onChange={(e) => maj(champ, e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
        ))}
        <label className="text-sm sm:col-span-2">
          <span className="text-xs font-semibold text-slate-500">Notes internes</span>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => maj("notes", e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button
          onClick={enregistrer}
          disabled={envoi}
          className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50"
        >
          {envoi ? "Enregistrement..." : "Enregistrer"}
        </button>
        <button onClick={inviter} className="text-sm text-sou-blue underline">
          {partenaire.auth_user_id ? "Renvoyer l'invitation" : "Envoyer l'invitation"}
        </button>
        <button onClick={basculerActif} className="text-sm text-slate-500 underline">
          {partenaire.active ? "Désactiver le partenaire" : "Réactiver"}
        </button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>

      <p className="text-xs text-slate-400 mt-3">
        Code PIN de comptoir (validation d&apos;un avantage sur /verifier-adhesion) :{" "}
        <span className="font-mono">{partenaire.pin_code || "—"}</span>{" "}
        <button onClick={regenererPin} className="underline">régénérer</button>
        {" · "}
        Espace partenaire : {partenaire.auth_user_id ? "activé" : "non activé"}
      </p>
    </div>
  );
}

// --- Section : périodes ------------------------------------------------
function SectionPeriodes({ accessToken, partenaireId, periodes, onRecharger }) {
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [niveau, setNiveau] = useState("");
  const [montant, setMontant] = useState("");
  const [note, setNote] = useState("");
  const [erreur, setErreur] = useState("");

  async function ajouter(e) {
    e.preventDefault();
    setErreur("");
    const res = await fetch(`/api/admin/partenaires/${partenaireId}/periodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ debut, fin, niveau, montantAnnonceEuros: montant, note }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreur(data.error || "Erreur.");
      return;
    }
    setDebut(""); setFin(""); setNiveau(""); setMontant(""); setNote("");
    onRecharger();
  }

  async function annuler(id, annulee) {
    await fetch(`/api/admin/partenaires/${partenaireId}/periodes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ annulee }),
    });
    onRecharger();
  }
  async function supprimer(id) {
    if (!confirm("Supprimer cette période ?")) return;
    await fetch(`/api/admin/partenaires/${partenaireId}/periodes/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    onRecharger();
  }

  return (
    <div className="border border-slate-200 rounded-xl p-5">
      <h2 className="font-semibold text-sou-blue mb-3">Période de partenariat</h2>
      {periodes.length === 0 ? (
        <p className="text-slate-500 text-sm mb-4">Aucune période enregistrée.</p>
      ) : (
        <ul className="divide-y divide-slate-100 mb-4">
          {periodes.map((p) => (
            <li key={p.id} className="py-2 flex flex-wrap justify-between gap-2 text-sm">
              <span className={p.annulee ? "line-through text-slate-400" : "text-slate-700"}>
                {dateFr(p.debut)} → {dateFr(p.fin)}
                {p.niveau ? ` · ${p.niveau}` : ""}
                {p.montant_annonce_cents != null ? ` · ${euros(p.montant_annonce_cents)} annoncés` : ""}
                {p.note ? ` · ${p.note}` : ""}
              </span>
              <span className="flex gap-3 text-xs">
                <button onClick={() => annuler(p.id, !p.annulee)} className="underline text-slate-500">
                  {p.annulee ? "Rétablir" : "Annuler"}
                </button>
                <button onClick={() => supprimer(p.id)} className="underline text-red-600">
                  Supprimer
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={ajouter} className="grid gap-2 sm:grid-cols-2">
        {erreur && <p className="text-sm text-red-600 sm:col-span-2">{erreur}</p>}
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Début</span>
          <input type="date" required value={debut} onChange={(e) => setDebut(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Fin</span>
          <input type="date" required value={fin} onChange={(e) => setFin(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Niveau (facultatif)</span>
          <input value={niveau} onChange={(e) => setNiveau(e.target.value)} placeholder="Gold / Silver / Bronze"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Montant annoncé € (facultatif)</span>
          <input type="number" min="0" step="1" value={montant} onChange={(e) => setMontant(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-xs font-semibold text-slate-500">Note (facultatif)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <div className="sm:col-span-2">
          <button className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full">
            Ajouter la période
          </button>
        </div>
      </form>
    </div>
  );
}

// --- Section : paiements ---------------------------------------------
function SectionPaiements({ accessToken, partenaireId, paiements, periodes, onRecharger }) {
  const [montant, setMontant] = useState("");
  const [recuLe, setRecuLe] = useState("");
  const [moyen, setMoyen] = useState("virement");
  const [reference, setReference] = useState("");
  const [periodeId, setPeriodeId] = useState("");
  const [note, setNote] = useState("");
  const [erreur, setErreur] = useState("");

  const total = paiements.reduce((s, p) => s + p.montant_cents, 0);

  async function ajouter(e) {
    e.preventDefault();
    setErreur("");
    const res = await fetch(`/api/admin/partenaires/${partenaireId}/paiements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        montantEuros: montant, recuLe, moyen, reference, note,
        periodeId: periodeId || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreur(data.error || "Erreur.");
      return;
    }
    setMontant(""); setRecuLe(""); setMoyen("virement"); setReference(""); setPeriodeId(""); setNote("");
    onRecharger();
  }

  async function supprimer(id) {
    if (!confirm("Supprimer cette ligne de paiement ?")) return;
    await fetch(`/api/admin/partenaires/${partenaireId}/paiements/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    onRecharger();
  }

  return (
    <div className="border border-slate-200 rounded-xl p-5">
      <h2 className="font-semibold text-sou-blue mb-1">Paiements reçus</h2>
      <p className="text-xs text-slate-400 mb-3">
        Saisie manuelle : cette liste ne déclenche aucun virement, elle en garde la trace.
      </p>
      {paiements.length === 0 ? (
        <p className="text-slate-500 text-sm mb-4">Aucun paiement enregistré.</p>
      ) : (
        <ul className="divide-y divide-slate-100 mb-2">
          {paiements.map((p) => (
            <li key={p.id} className="py-2 flex flex-wrap justify-between gap-2 text-sm">
              <span className="text-slate-700">
                {dateFr(p.recu_le)} · {MOYENS[p.moyen] || p.moyen}
                {p.reference ? ` · ${p.reference}` : ""}
                {p.note ? ` · ${p.note}` : ""}
              </span>
              <span className="flex items-center gap-3">
                <span className="font-medium text-slate-700">{euros(p.montant_cents)}</span>
                <button onClick={() => supprimer(p.id)} className="text-xs underline text-red-600">
                  Supprimer
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm font-semibold text-sou-blue mb-4">Total encaissé : {euros(total)}</p>

      <form onSubmit={ajouter} className="grid gap-2 sm:grid-cols-2">
        {erreur && <p className="text-sm text-red-600 sm:col-span-2">{erreur}</p>}
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Montant € *</span>
          <input type="number" min="0" step="0.01" required value={montant}
            onChange={(e) => setMontant(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Reçu le *</span>
          <input type="date" required value={recuLe} onChange={(e) => setRecuLe(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Moyen</span>
          <select value={moyen} onChange={(e) => setMoyen(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {Object.entries(MOYENS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Référence (facultatif)</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Rattacher à une période (facultatif)</span>
          <select value={periodeId} onChange={(e) => setPeriodeId(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="">—</option>
            {periodes.map((p) => (
              <option key={p.id} value={p.id}>{dateFr(p.debut)} → {dateFr(p.fin)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-slate-500">Note (facultatif)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <div className="sm:col-span-2">
          <button className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full">
            Enregistrer le paiement
          </button>
        </div>
      </form>
    </div>
  );
}

// --- Section : avantages + utilisation --------------------------------
function SectionAvantages({ avantages, evenements }) {
  return (
    <div className="border border-slate-200 rounded-xl p-5">
      <h2 className="font-semibold text-sou-blue mb-1">Avantages offerts</h2>
      <p className="text-xs text-slate-400 mb-3">
        Le partenaire gère lui-même ces avantages depuis son espace : ils partent en ligne sans
        validation. Le bureau suit ici l&apos;offre et son utilisation par les familles.
      </p>
      {avantages.length === 0 ? (
        <p className="text-slate-500 text-sm">Aucun avantage pour le moment.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {avantages.map((a) => (
            <li key={a.id} className="py-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-700">
                  {a.label}
                  {!a.active && <span className="text-xs text-slate-400"> (désactivé)</span>}
                </span>
                <span className="text-slate-500 text-xs whitespace-nowrap">
                  {a.utilisations} util. · {a.limite}/famille
                </span>
              </div>
              {a.description && <p className="text-xs text-slate-400">{a.description}</p>}
            </li>
          ))}
        </ul>
      )}

      <h3 className="text-sm font-semibold text-slate-600 mt-5 mb-2">Historique des offres</h3>
      {evenements.length === 0 ? (
        <p className="text-slate-400 text-sm">Aucun évènement enregistré.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {evenements.map((e) => (
            <li key={e.id} className="py-1.5 text-xs text-slate-500 flex justify-between gap-3">
              <span>
                <span className="font-semibold text-slate-600">{e.action}</span>
                {" — "}
                {e.details?.label || "avantage"}
                {e.details?.limite ? ` (${e.details.limite}/famille)` : ""}
              </span>
              <span className="whitespace-nowrap">
                {dateFr(e.created_at)}
                {e.auteur ? ` · ${e.auteur}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Section : documents --------------------------------------------
function SectionDocuments({ accessToken, partenaireId, documents, onRecharger }) {
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [fichier, setFichier] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  async function deposer(e) {
    e.preventDefault();
    setErreur("");
    if (!fichier) {
      setErreur("Choisissez un fichier (image ou PDF).");
      return;
    }
    setEnvoi(true);
    try {
      const fichierDataUrl = await fichierEnDataUrl(fichier);
      const res = await fetch(`/api/admin/partenaires/${partenaireId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ titre, description, fichierDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur.");
      setTitre(""); setDescription(""); setFichier(null);
      onRecharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  async function ouvrir(id) {
    const res = await fetch(`/api/admin/partenaires/${partenaireId}/documents/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (res.ok) window.open(data.url, "_blank", "noopener,noreferrer");
    else alert(data.error || "Impossible d'ouvrir ce fichier.");
  }

  async function supprimer(id) {
    if (!confirm("Supprimer ce document ?")) return;
    await fetch(`/api/admin/partenaires/${partenaireId}/documents/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    onRecharger();
  }

  return (
    <div className="border border-slate-200 rounded-xl p-5">
      <h2 className="font-semibold text-sou-blue mb-1">Documents partagés</h2>
      <p className="text-xs text-slate-400 mb-3">
        Visibles par le partenaire dans son espace (contrats, conventions, reçus...).
      </p>
      {documents.length === 0 ? (
        <p className="text-slate-500 text-sm mb-4">Aucun document.</p>
      ) : (
        <ul className="divide-y divide-slate-100 mb-4">
          {documents.map((d) => (
            <li key={d.id} className="py-2 flex flex-wrap justify-between gap-2 text-sm">
              <span className="text-slate-700">
                {d.titre}
                {d.description ? ` — ${d.description}` : ""}
                <span className="text-xs text-slate-400"> · {dateFr(d.depose_le)}</span>
              </span>
              <span className="flex gap-3 text-xs">
                <button onClick={() => ouvrir(d.id)} className="underline text-sou-blue">Voir</button>
                <button onClick={() => supprimer(d.id)} className="underline text-red-600">Supprimer</button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={deposer} className="space-y-2">
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <label className="text-sm block">
          <span className="text-xs font-semibold text-slate-500">Titre *</span>
          <input required value={titre} onChange={(e) => setTitre(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm block">
          <span className="text-xs font-semibold text-slate-500">Description (facultatif)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <input type="file" accept="image/*,application/pdf"
          onChange={(e) => setFichier(e.target.files?.[0] || null)}
          className="block w-full text-sm" />
        <button disabled={envoi}
          className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50">
          {envoi ? "Envoi..." : "Déposer le document"}
        </button>
      </form>
    </div>
  );
}

function FichePartenaire({ accessToken }) {
  const params = useParams();
  const id = params.id;
  const [data, setData] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  const recharger = useCallback(() => {
    return fetch(`/api/admin/partenaires/${id}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setErreur(d.error);
        else setData(d);
      })
      .finally(() => setChargement(false));
  }, [accessToken, id]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  if (chargement) return <p className="text-slate-500 text-sm">Chargement...</p>;
  if (erreur) return <p className="text-red-600 text-sm">{erreur}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <Link href="/admin/partenaires" className="text-sm text-slate-500 underline">
        ← Tous les partenaires
      </Link>
      <h1 className="text-2xl font-bold text-sou-blue">{data.partenaire.nom}</h1>

      <SectionCoordonnees
        accessToken={accessToken}
        partenaire={data.partenaire}
        onMaj={(p) => setData((d) => ({ ...d, partenaire: { ...d.partenaire, ...p } }))}
      />
      <SectionPeriodes
        accessToken={accessToken}
        partenaireId={id}
        periodes={data.periodes}
        onRecharger={recharger}
      />
      <SectionPaiements
        accessToken={accessToken}
        partenaireId={id}
        paiements={data.paiements}
        periodes={data.periodes}
        onRecharger={recharger}
      />
      <SectionAvantages avantages={data.avantages} evenements={data.evenements} />
      <SectionDocuments
        accessToken={accessToken}
        partenaireId={id}
        documents={data.documents}
        onRecharger={recharger}
      />
    </div>
  );
}

export default function AdminPartenaireDetailPage() {
  return (
    <AdminShell title="Partenaire">
      {(accessToken) => <FichePartenaire accessToken={accessToken} />}
    </AdminShell>
  );
}
