"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../admin-shell";

function formatCreneau(debut, fin) {
  const d = new Date(debut);
  const f = new Date(fin);
  return `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · ${d.toLocaleTimeString(
    "fr-FR",
    { hour: "2-digit", minute: "2-digit" }
  )}-${f.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function toIso(date, heure) {
  if (!date || !heure) return null;
  return new Date(`${date}T${heure}:00`).toISOString();
}

function fromIso(iso) {
  // Découpe un ISO en {date, heure} pour préremplir un formulaire.
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    heure: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function CreneauForm({ initial, onSubmit, onCancel }) {
  const [debut, setDebut] = useState(initial ? fromIso(initial.debut) : { date: "", heure: "" });
  const [fin, setFin] = useState(initial ? fromIso(initial.fin) : { date: "", heure: "" });
  const [places, setPlaces] = useState(initial?.places?.toString() || "1");
  const [nom, setNom] = useState(initial?.nom || "");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErreur("");
    const debutIso = toIso(debut.date, debut.heure);
    const finIso = toIso(fin.date || debut.date, fin.heure);
    if (!debutIso || !finIso) {
      setErreur("Date et heures obligatoires.");
      return;
    }
    setEnvoi(true);
    try {
      await onSubmit({ debut: debutIso, fin: finIso, places: Number(places), nom: nom.trim() || null });
    } catch (err) {
      setErreur(err.message || "Une erreur est survenue.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
      {erreur && <p className="text-xs text-red-600">{erreur}</p>}
      <input
        type="text"
        placeholder="Nom du créneau (facultatif) — ex : Service midi"
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
      />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <input
          required
          type="date"
          value={debut.date}
          onChange={(e) => setDebut({ ...debut, date: e.target.value })}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
        />
        <input
          required
          type="time"
          value={debut.heure}
          onChange={(e) => setDebut({ ...debut, heure: e.target.value })}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
          title="Heure de début"
        />
        <input
          required
          type="time"
          value={fin.heure}
          onChange={(e) => setFin({ heure: e.target.value, date: debut.date })}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
          title="Heure de fin"
        />
        <input
          required
          type="number"
          min="1"
          placeholder="Places"
          value={places}
          onChange={(e) => setPlaces(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={envoi}
            className="bg-sou-blue text-white text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
          >
            OK
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-sm text-slate-500">
              Annuler
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

// Propose un créneau à la suite du dernier de l'atelier : même jour, heure
// de début = heure de fin du précédent, même durée. Reste modifiable à la
// main avant validation.
function suggestionProchainCreneau(creneaux) {
  if (!creneaux || creneaux.length === 0) return null;
  const dernier = creneaux[creneaux.length - 1];
  const debutPrecedent = new Date(dernier.debut);
  const finPrecedent = new Date(dernier.fin);
  const dureeMs = finPrecedent - debutPrecedent;
  const debut = finPrecedent;
  const fin = new Date(finPrecedent.getTime() + dureeMs);
  return { debut: debut.toISOString(), fin: fin.toISOString(), places: dernier.places };
}

// Événement ouvert par défaut : celui (actif) dont le prochain créneau est le
// plus proche ; à défaut le premier actif, puis le premier tout court.
function prochainEvenement(liste) {
  const maintenant = Date.now() - 12 * 3600 * 1000; // la journée en cours compte encore
  let meilleur = null;
  let meilleurDebut = Infinity;
  for (const ev of liste) {
    if (!ev.actif) continue;
    for (const a of ev.ateliers || []) {
      for (const c of a.creneaux || []) {
        const t = new Date(c.fin || c.debut).getTime();
        if (t >= maintenant && t < meilleurDebut) {
          meilleurDebut = t;
          meilleur = ev;
        }
      }
    }
  }
  return meilleur || liste.find((e) => e.actif) || liste[0] || null;
}

const echapper = (t) =>
  String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Feuilles à afficher sur chaque atelier : une page par atelier, son nom en
// gros en tête ; une ligne par créneau, une colonne par bénévole nécessaire
// (3 places = 3 colonnes « Bénévole 1, 2, 3 »). Case remplie avec le prénom et
// le nom de l'inscrit, ou vide pour s'inscrire sur place. Les places qui
// n'existent pas sur un créneau plus court sont grisées. Jamais d'e-mail ni de
// téléphone (confidentiels).
function imprimerFeuilles(evenement, ateliers) {
  const MAX_COL = 10; // au-delà, le créneau passe sur plusieurs lignes (cases plus larges)
  const jourDe = (iso) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const heures = (debut, fin) => {
    const h = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `${h(debut)} - ${h(fin)}`;
  };
  const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const pages = ateliers
    .map((a) => {
      const creneaux = a.creneaux || [];
      // Date(s) de l'atelier dans le titre, sauf si son nom la contient déjà.
      const jours = [...new Set(creneaux.map((c) => jourDe(c.debut)))];
      const dateTitre = jours.join(" et ");
      const titre = jours.length && !jours.every((j) => sansAccent(a.nom).includes(sansAccent(j)))
        ? `${echapper(a.nom)}<span class="date"> — ${echapper(dateTitre)}</span>`
        : echapper(a.nom);
      const plusieursJours = jours.length > 1;
      const nbCol = Math.min(MAX_COL, Math.max(1, ...creneaux.map((c) => Math.max(c.places || 1, (c.noms || []).length))));
      const entete = `<tr><th class="h">Horaire</th>${Array.from({ length: nbCol }, (_, k) => `<th>Bénévole ${k + 1}</th>`).join("")}</tr>`;
      const lignes = creneaux
        .map((c) => {
          const noms = c.noms || [];
          const places = Math.max(c.places || 1, noms.length);
          const nbLignes = Math.ceil(places / nbCol);
          const horaire = `<span class="heure">${plusieursJours ? `${echapper(jourDe(c.debut))}<br>` : ""}${echapper(heures(c.debut, c.fin))}</span>${c.nom ? `<br><span class="tache">${echapper(c.nom)}</span>` : ""}`;
          return Array.from({ length: nbLignes }, (_, r) => {
            const cases = Array.from({ length: nbCol }, (_, k) => {
              const i = r * nbCol + k;
              return i < places ? `<td class="case">${echapper(noms[i] || "")}</td>` : `<td class="sans"></td>`;
            }).join("");
            const tete = r === 0 ? `<td class="h" rowspan="${nbLignes}">${horaire}</td>` : "";
            return `<tr class="${r === nbLignes - 1 ? "fin" : ""}">${tete}${cases}</tr>`;
          }).join("");
        })
        .join("");
      return `<section><div class="titre">${titre}</div><div class="sous">${echapper(evenement.nom)} — planning des bénévoles</div>
<table><thead>${entete}</thead><tbody>${lignes || `<tr><td>Aucun créneau.</td></tr>`}</tbody></table>
<p class="pied">Une case blanche vide ? Inscrivez-vous en écrivant votre prénom et votre nom. Les cases grisées ne sont pas à remplir. Merci pour votre aide !</p></section>`;
    })
    .join("");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(evenement.nom)} — feuilles bénévoles</title>
<style>
@page{size:A4 landscape;margin:8mm}
body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:0}
section{page-break-after:always;break-after:page}
section:last-child{page-break-after:auto;break-after:auto}
.titre{font-size:34px;font-weight:bold;color:#1F3864;text-align:center;text-transform:uppercase;letter-spacing:1px;border-bottom:4px solid #1F3864;padding-bottom:6px;margin-bottom:4px}
.date{color:#b45309}
.sous{font-size:14px;color:#64748b;text-align:center;margin-bottom:12px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{border:1.5px solid #475569;padding:6px;font-size:13px;text-align:center;vertical-align:middle;word-wrap:break-word}
th{background:#1F3864;color:#fff;font-size:13px}
th.h,td.h{width:150px;text-align:left;background:#f1f5f9}
th.h{background:#1F3864}
.heure{font-size:15px;font-weight:bold}
.tache{font-size:11px;color:#475569}
td.case{height:52px;font-size:14px;font-weight:bold}
td.sans{background:repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0 4px,#f8fafc 4px,#f8fafc 8px)}
tr{page-break-inside:avoid;break-inside:avoid}
tr.fin td{border-bottom:3px solid #1F3864}
td.case{width:auto}
thead{display:table-header-group}
.pied{font-size:12px;color:#64748b;margin-top:8px}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style></head><body>${pages}<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) {
    alert("Le navigateur a bloqué la nouvelle fenêtre : autorisez les fenêtres pop-up pour ce site, puis recommencez.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function AtelierBloc({ atelier, accessToken, onChange, afficherNoms }) {
  const [nouveauCreneau, setNouveauCreneau] = useState(false);
  const [creneauEnEdition, setCreneauEnEdition] = useState(null);
  const [renommage, setRenommage] = useState(false);
  const [nouveauNom, setNouveauNom] = useState(atelier.nom);

  async function renommerAtelier(e) {
    e.preventDefault();
    if (!nouveauNom.trim() || nouveauNom.trim() === atelier.nom) {
      setRenommage(false);
      return;
    }
    const res = await fetch(`/api/admin/benevoles/ateliers/${atelier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ nom: nouveauNom }),
    });
    if (res.ok) {
      setRenommage(false);
      onChange();
    }
  }

  async function creerCreneau(form) {
    const res = await fetch("/api/admin/benevoles/creneaux", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ atelierId: atelier.id, ...form }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setNouveauCreneau(false);
    onChange();
  }

  async function modifierCreneau(id, form) {
    const res = await fetch(`/api/admin/benevoles/creneaux/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setCreneauEnEdition(null);
    onChange();
  }

  async function supprimerCreneau(id) {
    if (!confirm("Supprimer ce créneau ? Les inscriptions dessus seront perdues.")) return;
    await fetch(`/api/admin/benevoles/creneaux/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    onChange();
  }

  async function supprimerAtelier() {
    if (!confirm(`Supprimer l'atelier « ${atelier.nom} » et tous ses créneaux ?`)) return;
    await fetch(`/api/admin/benevoles/ateliers/${atelier.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    onChange();
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        {renommage ? (
          <form onSubmit={renommerAtelier} className="flex gap-2 flex-1">
            <input
              autoFocus
              value={nouveauNom}
              onChange={(e) => setNouveauNom(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-sm font-semibold flex-1"
            />
            <button type="submit" className="text-sm text-sou-blue font-semibold">
              OK
            </button>
            <button
              type="button"
              onClick={() => {
                setNouveauNom(atelier.nom);
                setRenommage(false);
              }}
              className="text-sm text-slate-500"
            >
              Annuler
            </button>
          </form>
        ) : (
          <p className="font-semibold text-slate-800">{atelier.nom}</p>
        )}
        <div className="flex gap-3 shrink-0">
          {!renommage && (
            <button onClick={() => setRenommage(true)} className="text-sm text-sou-blue font-semibold">
              Renommer
            </button>
          )}
          <button onClick={() => setNouveauCreneau(true)} className="text-sm text-sou-blue font-semibold">
            + Créneau
          </button>
          <button onClick={supprimerAtelier} className="text-sm text-red-600">
            Supprimer l&apos;atelier
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {atelier.creneaux.map((c) =>
          creneauEnEdition === c.id ? (
            <CreneauForm
              key={c.id}
              initial={c}
              onSubmit={(form) => modifierCreneau(c.id, form)}
              onCancel={() => setCreneauEnEdition(null)}
            />
          ) : (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 text-sm bg-white border border-slate-100 rounded-lg px-3 py-2">
              <span>
                {c.nom && <span className="font-medium">{c.nom} — </span>}
                {formatCreneau(c.debut, c.fin)}
                {afficherNoms && (
                  <span className="block text-xs text-slate-600 mt-0.5">
                    {(c.noms || []).length ? c.noms.join(", ") : <span className="text-slate-400 italic">personne pour l&apos;instant</span>}
                  </span>
                )}
              </span>
              <span className="text-slate-500">
                {c.inscrits}/{c.places} inscrit{c.inscrits > 1 ? "s" : ""}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setCreneauEnEdition(c.id)} className="text-sou-blue">
                  Modifier
                </button>
                <button onClick={() => supprimerCreneau(c.id)} className="text-red-600">
                  Suppr.
                </button>
              </div>
            </div>
          )
        )}
        {atelier.creneaux.length === 0 && !nouveauCreneau && (
          <p className="text-sm text-slate-400">Aucun créneau pour le moment.</p>
        )}
        {nouveauCreneau && (
          <CreneauForm
            initial={suggestionProchainCreneau(atelier.creneaux)}
            onSubmit={creerCreneau}
            onCancel={() => setNouveauCreneau(false)}
          />
        )}
      </div>
    </div>
  );
}

// « Ewen (PS), Maël (CM2) » : les enfants de la famille du bénévole, quand elle
// est reconnue (compte connecté ou même adresse e-mail qu'un parent).
function libelleEnfants(enfants) {
  return (enfants || []).map((e) => (e.classe ? `${e.prenom} (${e.classe})` : e.prenom)).join(", ");
}

function InscriptionsRoster({ evenementId, accessToken }) {
  const [inscriptions, setInscriptions] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [portee, setPortee] = useState("evenement"); // evenement | tous
  const [groupePar, setGroupePar] = useState("atelier"); // atelier | benevole | aucun

  useEffect(() => {
    setChargement(true);
    const url =
      portee === "tous"
        ? "/api/admin/benevoles/inscriptions"
        : `/api/admin/benevoles/inscriptions?evenementId=${evenementId}`;
    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((d) => setInscriptions(d.inscriptions || []))
      .finally(() => setChargement(false));
  }, [evenementId, accessToken, portee]);

  function exporterCsv() {
    const lignes = [
      ["Événement", "Atelier", "Créneau", "Prénom", "Nom", "E-mail", "Téléphone", "Enfants (classe)"],
      ...inscriptions.map((i) => [
        i.evenementNom,
        i.atelierNom,
        formatCreneau(i.debut, i.fin),
        i.first_name,
        i.last_name,
        i.email,
        i.phone || "",
        libelleEnfants(i.enfants),
      ]),
    ];
    const csv = lignes.map((l) => l.map((v) => `"${(v || "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "benevoles.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (chargement) return <p className="text-slate-500 text-sm">Chargement...</p>;

  const cleGroupe = (i) =>
    groupePar === "atelier" ? i.atelierNom : groupePar === "benevole" ? `${i.first_name} ${i.last_name} (${i.email})` : null;

  const groupes =
    groupePar === "aucun"
      ? [["Tous les bénévoles", inscriptions]]
      : Object.entries(
          inscriptions.reduce((acc, i) => {
            const cle = cleGroupe(i);
            (acc[cle] = acc[cle] || []).push(i);
            return acc;
          }, {})
        );

  return (
    <div className="space-y-4 print:space-y-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <select
          value={portee}
          onChange={(e) => setPortee(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
        >
          <option value="evenement">Cet événement</option>
          <option value="tous">Historique complet (tous événements)</option>
        </select>
        <select
          value={groupePar}
          onChange={(e) => setGroupePar(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
        >
          <option value="atelier">Grouper par atelier</option>
          <option value="benevole">Grouper par bénévole</option>
          <option value="aucun">Ne pas grouper</option>
        </select>
        <button onClick={exporterCsv} className="text-sm text-sou-blue font-semibold underline">
          Exporter en CSV
        </button>
        <button onClick={() => window.print()} className="text-sm text-sou-blue font-semibold underline">
          Imprimer
        </button>
        <span className="text-sm text-slate-500">{inscriptions.length} inscription(s)</span>
      </div>

      {inscriptions.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune inscription pour le moment.</p>
      ) : (
        groupes.map(([titre, lignes]) => (
          <div key={titre}>
            <p className="font-semibold text-slate-700 mb-2">
              {titre}
              {groupePar === "benevole" && (
                <span className="text-slate-400 font-normal"> — {lignes.length} créneau{lignes.length > 1 ? "x" : ""}</span>
              )}
            </p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  {portee === "tous" && <th className="py-1.5 pr-3">Événement</th>}
                  <th className="py-1.5 pr-3">Créneau</th>
                  <th className="py-1.5 pr-3">Nom</th>
                  <th className="py-1.5 pr-3">E-mail</th>
                  <th className="py-1.5 pr-3">Téléphone</th>
                  <th className="py-1.5 pr-3">Enfants (classe)</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((i) => (
                  <tr key={i.id} className="border-b border-slate-100">
                    {portee === "tous" && <td className="py-1.5 pr-3">{i.evenementNom}</td>}
                    <td className="py-1.5 pr-3">{formatCreneau(i.debut, i.fin)}</td>
                    <td className="py-1.5 pr-3">
                      {i.first_name} {i.last_name}
                    </td>
                    <td className="py-1.5 pr-3">{i.email}</td>
                    <td className="py-1.5 pr-3">{i.phone}</td>
                    <td className="py-1.5 pr-3">{libelleEnfants(i.enfants) || <span className="text-slate-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

function BenevolesAdmin({ accessToken }) {
  const [evenements, setEvenements] = useState([]);
  const [evenementActifId, setEvenementActifId] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [nouvelAtelier, setNouvelAtelier] = useState(false);
  const [nomAtelier, setNomAtelier] = useState("");
  const [nouvelEvenement, setNouvelEvenement] = useState(false);
  const [nomEvenement, setNomEvenement] = useState("");
  const [descriptionEvenement, setDescriptionEvenement] = useState("");
  const [onglet, setOnglet] = useState("planning"); // planning | inscrits
  const [afficherNoms, setAfficherNoms] = useState(false);
  const [atelierFeuille, setAtelierFeuille] = useState(""); // "" = tous les ateliers
  const [editionDescription, setEditionDescription] = useState(false);
  const [descriptionEnEdition, setDescriptionEnEdition] = useState("");

  const charger = useCallback(async () => {
    const res = await fetch("/api/admin/benevoles/evenements", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    const liste = data.evenements || [];
    setEvenements(liste);
    setEvenementActifId((courant) => courant || prochainEvenement(liste)?.id || null);
    setChargement(false);
  }, [accessToken]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function creerEvenement(e) {
    e.preventDefault();
    if (!nomEvenement.trim()) return;
    const res = await fetch("/api/admin/benevoles/evenements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ nom: nomEvenement, description: descriptionEvenement }),
    });
    const data = await res.json();
    if (res.ok) {
      setNomEvenement("");
      setDescriptionEvenement("");
      setNouvelEvenement(false);
      setEvenementActifId(data.evenement.id);
      charger();
    }
  }

  async function enregistrerDescription() {
    await fetch(`/api/admin/benevoles/evenements/${evenementActifId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ description: descriptionEnEdition }),
    });
    setEditionDescription(false);
    charger();
  }

  async function basculerActifEvenement(ev) {
    await fetch(`/api/admin/benevoles/evenements/${ev.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ actif: !ev.actif }),
    });
    charger();
  }

  async function creerAtelier(e) {
    e.preventDefault();
    if (!nomAtelier.trim() || !evenementActifId) return;
    const res = await fetch("/api/admin/benevoles/ateliers", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ nom: nomAtelier, evenementId: evenementActifId }),
    });
    if (res.ok) {
      setNomAtelier("");
      setNouvelAtelier(false);
      charger();
    }
  }

  if (chargement) return <p className="text-slate-500 text-sm">Chargement...</p>;

  const evenementActif = evenements.find((e) => e.id === evenementActifId) || null;

  return (
    <div className="space-y-6 print:space-y-0">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {evenements.map((ev) => (
          <button
            key={ev.id}
            onClick={() => setEvenementActifId(ev.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
              evenementActifId === ev.id ? "bg-sou-blue text-white" : "bg-slate-100 text-slate-600"
            } ${!ev.actif ? "opacity-50" : ""}`}
          >
            {ev.nom}
            {!ev.actif && " (désactivé)"}
          </button>
        ))}
        {!nouvelEvenement ? (
          <button
            onClick={() => setNouvelEvenement(true)}
            className="px-3 py-1.5 rounded-full text-sm font-semibold border border-dashed border-slate-300 text-slate-500"
          >
            + Événement
          </button>
        ) : (
          <form onSubmit={creerEvenement} className="flex flex-wrap gap-2 items-start">
            <input
              autoFocus
              value={nomEvenement}
              onChange={(e) => setNomEvenement(e.target.value)}
              placeholder="Ex : Foire 2026"
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
            />
            <input
              value={descriptionEvenement}
              onChange={(e) => setDescriptionEvenement(e.target.value)}
              placeholder="Petit résumé (facultatif), affiché sur la page publique"
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[16rem]"
            />
            <button type="submit" className="text-sm text-sou-blue font-semibold">
              OK
            </button>
          </form>
        )}
      </div>

      {!evenementActif ? (
        <p className="text-slate-500 text-sm">Créez un premier événement pour commencer.</p>
      ) : (
        <>
          <div className="flex items-center justify-between print:hidden">
            <div className="flex gap-2 text-sm font-semibold">
              <button
                onClick={() => setOnglet("planning")}
                className={`px-3 py-1.5 rounded-full ${onglet === "planning" ? "bg-sou-blue text-white" : "bg-slate-100 text-slate-600"}`}
              >
                Planning
              </button>
              <button
                onClick={() => setOnglet("inscrits")}
                className={`px-3 py-1.5 rounded-full ${onglet === "inscrits" ? "bg-sou-blue text-white" : "bg-slate-100 text-slate-600"}`}
              >
                Bénévoles inscrits
              </button>
            </div>
            <button onClick={() => basculerActifEvenement(evenementActif)} className="text-sm text-slate-500 underline">
              {evenementActif.actif ? "Désactiver l'événement" : "Réactiver l'événement"}
            </button>
          </div>

          <div className="print:hidden">
            {editionDescription ? (
              <div className="flex flex-wrap gap-2 items-start">
                <input
                  autoFocus
                  value={descriptionEnEdition}
                  onChange={(e) => setDescriptionEnEdition(e.target.value)}
                  placeholder="Petit résumé de l'événement, affiché sur la page publique"
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[16rem]"
                />
                <button onClick={enregistrerDescription} className="text-sm text-sou-blue font-semibold">
                  OK
                </button>
                <button onClick={() => setEditionDescription(false)} className="text-sm text-slate-500">
                  Annuler
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                {evenementActif.description || <span className="italic">Aucun résumé pour le moment.</span>}{" "}
                <button
                  onClick={() => {
                    setDescriptionEnEdition(evenementActif.description || "");
                    setEditionDescription(true);
                  }}
                  className="text-sou-blue font-semibold"
                >
                  {evenementActif.description ? "Modifier" : "Ajouter un résumé"}
                </button>
              </p>
            )}
          </div>

          {onglet === "planning" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={afficherNoms} onChange={(e) => setAfficherNoms(e.target.checked)} />
                  Afficher les noms des inscrits
                </label>
                <span className="text-slate-300">|</span>
                <span className="text-slate-600">Feuilles à afficher sur les ateliers :</span>
                <select value={atelierFeuille} onChange={(e) => setAtelierFeuille(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1">
                  <option value="">Tous les ateliers (une page par atelier)</option>
                  {evenementActif.ateliers.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                </select>
                <button
                  onClick={() => imprimerFeuilles(evenementActif, atelierFeuille ? evenementActif.ateliers.filter((a) => a.id === atelierFeuille) : evenementActif.ateliers)}
                  className="font-semibold text-sou-blue underline"
                >
                  Imprimer les feuilles
                </button>
              </div>
              {evenementActif.ateliers.map((atelier) => (
                <AtelierBloc key={atelier.id} atelier={atelier} accessToken={accessToken} onChange={charger} afficherNoms={afficherNoms} />
              ))}
              {!nouvelAtelier ? (
                <button
                  onClick={() => setNouvelAtelier(true)}
                  className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-lg"
                >
                  + Nouvel atelier
                </button>
              ) : (
                <form onSubmit={creerAtelier} className="flex gap-2">
                  <input
                    autoFocus
                    value={nomAtelier}
                    onChange={(e) => setNomAtelier(e.target.value)}
                    placeholder="Ex : Buvette"
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1"
                  />
                  <button type="submit" className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-lg">
                    Créer
                  </button>
                  <button type="button" onClick={() => setNouvelAtelier(false)} className="text-sm text-slate-500">
                    Annuler
                  </button>
                </form>
              )}
            </div>
          ) : (
            <InscriptionsRoster evenementId={evenementActif.id} accessToken={accessToken} />
          )}
        </>
      )}
    </div>
  );
}

export default function AdminBenevolesPage() {
  return (
    <AdminShell title="Bénévoles">
      {(accessToken) => (
        <div>
          <h1 className="text-2xl font-bold text-sou-blue mb-1">Créneaux bénévoles</h1>
          <p className="text-slate-500 text-sm mb-6 print:hidden">
            Un événement regroupe des ateliers (postes), chacun avec ses propres créneaux horaires et son
            nombre de places. Les bénévoles s&apos;inscrivent sans compte sur <span className="font-mono">/benevoles</span>.
          </p>
          <BenevolesAdmin accessToken={accessToken} />
        </div>
      )}
    </AdminShell>
  );
}
