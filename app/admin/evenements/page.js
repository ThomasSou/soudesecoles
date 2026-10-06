"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminShell from "../admin-shell";
import { formatEventDates, isUpcoming } from "../../evenements/data";

export default function AdminEvenementsPage() {
  return (
    <AdminShell title="Événements du site">
      {(token) => <Evenements token={token} />}
    </AdminShell>
  );
}

const VIDE = { name: "", dateDebut: "", dateFin: "", lieu: "", description: "", imageUrl: "", visible: true };

function lireFichier(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error("lecture impossible"));
    r.readAsDataURL(file);
  });
}

function Formulaire({ initial, token, onSubmit, onCancel, libelleBouton }) {
  const [form, setForm] = useState(initial || VIDE);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");
  const fichierRef = useRef(null);

  async function envoyer(e) {
    e.preventDefault();
    setErreur("");
    setBusy(true);
    try {
      let imageUrl = form.imageUrl;
      const fichier = fichierRef.current?.files?.[0];
      if (fichier) {
        const res = await fetch("/api/admin/evenements-site/image", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ dataUrl: await lireFichier(fichier) }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Échec de l'envoi de l'image.");
        imageUrl = d.url;
      }
      await onSubmit({ ...form, imageUrl });
    } catch (err) {
      setErreur(err.message || "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={envoyer} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <div>
        <label className="text-xs font-semibold text-slate-500">Nom</label>
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500">Date (ou premier jour)</label>
          <input
            required
            type="date"
            value={form.dateDebut}
            onChange={(e) => setForm({ ...form, dateDebut: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Dernier jour (si sur plusieurs jours)</label>
          <input
            type="date"
            value={form.dateFin || ""}
            onChange={(e) => setForm({ ...form, dateFin: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500">Lieu</label>
        <input
          value={form.lieu || ""}
          onChange={(e) => setForm({ ...form, lieu: e.target.value })}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500">Description</label>
        <textarea
          rows={3}
          value={form.description || ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 block">Image (facultatif)</label>
          <input ref={fichierRef} type="file" accept="image/*" className="text-sm" />
        </div>
        {form.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.imageUrl} alt="" className="h-14 rounded-lg" />
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.visible !== false}
          onChange={(e) => setForm({ ...form, visible: e.target.checked })}
        />
        Affiché sur le site
      </label>
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="bg-sou-blue text-white text-sm font-semibold px-5 py-2 rounded-full disabled:opacity-50"
        >
          {busy ? "Enregistrement..." : libelleBouton}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 px-3">
          Annuler
        </button>
      </div>
    </form>
  );
}

function Evenements({ token }) {
  const [evenements, setEvenements] = useState(null);
  const [error, setError] = useState("");
  const [nouveau, setNouveau] = useState(false);
  const [enEdition, setEnEdition] = useState(null);

  const charger = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/admin/evenements-site", { headers: { Authorization: `Bearer ${token}` } });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Erreur.");
      return;
    }
    setEvenements(d.evenements || []);
  }, [token]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function appeler(methode, corps) {
    const res = await fetch("/api/admin/evenements-site", {
      method: methode,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(corps),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Une erreur est survenue.");
    return d;
  }

  async function creer(form) {
    await appeler("POST", form);
    setNouveau(false);
    charger();
  }
  async function modifier(e, form) {
    await appeler("PATCH", { id: e.id, ...form, dateDebutActuelle: e.date_debut });
    setEnEdition(null);
    charger();
  }
  async function basculer(e) {
    try {
      await appeler("PATCH", { id: e.id, visible: !e.visible });
      charger();
    } catch (err) {
      alert(err.message);
    }
  }
  async function supprimer(e) {
    if (!confirm(`Supprimer « ${e.name} » du calendrier ?`)) return;
    try {
      await appeler("DELETE", { id: e.id });
      charger();
    } catch (err) {
      alert(err.message);
    }
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!evenements) return <p className="text-slate-500">Chargement...</p>;

  const adapter = (e) => ({ date: e.date_debut, endDate: e.date_fin || undefined });
  const aVenir = evenements.filter((e) => isUpcoming(adapter(e)));
  const passes = evenements.filter((e) => !isUpcoming(adapter(e))).reverse();

  const ligne = (e) =>
    enEdition === e.id ? (
      <Formulaire
        key={e.id}
        token={token}
        libelleBouton="Enregistrer"
        initial={{
          name: e.name,
          dateDebut: e.date_debut,
          dateFin: e.date_fin || "",
          lieu: e.lieu || "",
          description: e.description || "",
          imageUrl: e.image_url || "",
          visible: e.visible,
        }}
        onSubmit={(form) => modifier(e, form)}
        onCancel={() => setEnEdition(null)}
      />
    ) : (
      <div key={e.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-4">
        {e.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.image_url} alt="" className="w-16 h-12 object-cover rounded-lg" />
        ) : (
          <div className="w-16 h-12 bg-slate-100 rounded-lg" />
        )}
        <div className="flex-1 min-w-[200px]">
          <p className="font-semibold text-slate-800">
            {e.name}{" "}
            {!e.visible && <span className="text-xs text-slate-400">(masqué)</span>}
            {e.page_dediee && <span className="text-xs text-sou-blue ml-1">· page dédiée</span>}
          </p>
          <p className="text-xs text-slate-500">
            {formatEventDates(adapter({ date_debut: e.date_debut, date_fin: e.date_fin }))}
            {e.lieu ? ` · ${e.lieu}` : ""}
          </p>
        </div>
        <button
          onClick={() => basculer(e)}
          className={`text-xs font-semibold px-3 py-1 rounded-full border ${
            e.visible ? "border-green-300 bg-green-50 text-green-700" : "border-slate-300 bg-slate-100 text-slate-500"
          }`}
        >
          {e.visible ? "Affiché" : "Masqué"}
        </button>
        <button onClick={() => setEnEdition(e.id)} className="text-sm text-sou-blue font-semibold">
          Modifier
        </button>
        <button onClick={() => supprimer(e)} className="text-sm text-red-600">
          Supprimer
        </button>
      </div>
    );

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Ces événements alimentent le calendrier public (page d&apos;accueil et page Événements). Les
        manifestations à venir passent en premier, les passées basculent en fin de liste toutes seules.
      </p>

      {!nouveau && (
        <button
          onClick={() => setNouveau(true)}
          className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          + Nouvel événement
        </button>
      )}
      {nouveau && (
        <Formulaire token={token} libelleBouton="Créer l'événement" onSubmit={creer} onCancel={() => setNouveau(false)} />
      )}

      <div className="space-y-3">
        <h3 className="font-semibold text-slate-700">À venir ({aVenir.length})</h3>
        {aVenir.map(ligne)}
        {aVenir.length === 0 && <p className="text-sm text-slate-400">Aucun événement à venir.</p>}
      </div>
      {passes.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-700">Passés ({passes.length})</h3>
          {passes.map(ligne)}
        </div>
      )}
    </div>
  );
}
