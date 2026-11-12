"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "../admin-shell";
import { currentSchoolYear, isMembershipValid } from "../../lib/anneeScolaire";
import { enseignantDuNiveau } from "../../lib/classesReference";

export default function AdminEnfantsPage() {
  return (
    <AdminShell title="Enfants">
      {(token) => <ListeEnfants token={token} />}
    </AdminShell>
  );
}

const COLONNES = [
  { key: "lastName", label: "Nom" },
  { key: "firstName", label: "Prénom" },
  { key: "classLevel", label: "Classe" },
  { key: "niveau", label: "Niveau" },
  { key: "teacherName", label: "Professeur" },
  { key: "familyName", label: "Famille" },
  { key: "aJour", label: "Cotisation" },
];

// Import des niveaux individuels de l'élémentaire (CP, CE1, CE2, CM1, CM2) depuis
// la « Liste simple des élèves par classe » éditée par l'école (PDF). Aperçu
// d'abord, rien n'est écrit tant que le bureau ne confirme pas. Le PDF n'est
// pas conservé ; date de naissance et sexe sont ignorés.
function ImportNiveaux({ token, onDone }) {
  const [ouvert, setOuvert] = useState(false);
  const [pdf, setPdf] = useState(null); // corps à renvoyer à l'application : { pdfDataUrl } ou { eleves }
  const [apercu, setApercu] = useState(null);
  const [alignerClasse, setAlignerClasse] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const [fait, setFait] = useState("");

  function lire(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  async function appeler(corps) {
    const res = await fetch("/api/admin/enfants/niveaux", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(corps),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Une erreur est survenue.");
    return d;
  }
  async function choisir(file) {
    if (!file) return;
    setErreur("");
    setFait("");
    setApercu(null);
    setOccupe(true);
    try {
      // Fichier .json : liste déjà lue (secours quand le PDF n'est pas lisible
      // par le serveur). Sinon, le PDF lui-même.
      let source;
      if (/\.json$/i.test(file.name)) {
        const contenu = JSON.parse(await file.text());
        source = { eleves: Array.isArray(contenu) ? contenu : contenu.eleves };
      } else {
        source = { pdfDataUrl: await lire(file) };
      }
      setPdf(source);
      setApercu(await appeler({ ...source, appliquer: false }));
    } catch (e) {
      setErreur(e.message);
    }
    setOccupe(false);
  }
  async function appliquer() {
    setErreur("");
    setOccupe(true);
    try {
      const d = await appeler({ ...pdf, appliquer: true, alignerClasse });
      setFait(`${d.ecrits} enfant${d.ecrits > 1 ? "s" : ""} mis à jour.`);
      setApercu(null);
      setPdf(null);
      onDone();
    } catch (e) {
      setErreur(e.message);
    }
    setOccupe(false);
  }

  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)} className="text-sm text-sou-blue underline mb-4">
        Importer les niveaux de l&apos;élémentaire depuis la liste de l&apos;école (PDF)
      </button>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 mb-6 text-sm space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-sou-blue">Niveaux de l&apos;élémentaire (CP, CE1, CE2, CM1, CM2)</p>
        <button onClick={() => setOuvert(false)} className="text-xs text-slate-400">fermer</button>
      </div>
      <p className="text-slate-500">
        Déposez la « Liste simple des élèves par classe » éditée par l&apos;école. Le site retrouve chaque enfant par son nom et
        son prénom, et renseigne son niveau (utile pour cibler les e-mails dans les classes à double niveau). Rien n&apos;est
        écrit avant votre confirmation ; le PDF n&apos;est pas conservé, la date de naissance et le sexe sont ignorés.
      </p>
      <input type="file" accept="application/pdf,application/json,.json" disabled={occupe} onChange={(e) => choisir(e.target.files?.[0])} className="text-sm" />
      {occupe && <p className="text-slate-500">Lecture en cours...</p>}
      {erreur && <p className="text-red-600">{erreur}</p>}
      {fait && <p className="text-green-700 font-semibold">{fait}</p>}

      {apercu && (
        <div className="space-y-2 bg-slate-50 rounded-lg p-3">
          <p>
            <strong>{apercu.dansLaListe}</strong> élèves dans la liste · <strong>{apercu.aMettreAJour}</strong> niveaux à
            renseigner · {apercu.dejaAJour} déjà à jour · {apercu.nonRetrouves} non retrouvés sur le site
            {apercu.ambigus > 0 ? ` · ${apercu.ambigus} ambigus (ignorés)` : ""}.
          </p>
          {apercu.nbClasseDifferente > 0 && (
            <div>
              <p className="text-amber-700 font-semibold">
                {apercu.nbClasseDifferente} enfant{apercu.nbClasseDifferente > 1 ? "s ont" : " a"} une classe différente sur le site :
              </p>
              <ul className="text-xs text-slate-600 list-disc pl-5">
                {apercu.classeDifferente.map((c, i) => (
                  <li key={i}>{c.nom} : {c.classeSite || "—"} sur le site, {c.classeListe} sur la liste</li>
                ))}
              </ul>
              <label className="flex items-center gap-2 mt-1">
                <input type="checkbox" checked={alignerClasse} onChange={(e) => setAlignerClasse(e.target.checked)} />
                Recaler aussi la classe sur la liste de l&apos;école
              </label>
            </div>
          )}
          {apercu.nbElementairesAbsents > 0 && (
            <details>
              <summary className="cursor-pointer text-slate-600">
                {apercu.nbElementairesAbsents} enfant{apercu.nbElementairesAbsents > 1 ? "s" : ""} d&apos;élémentaire du site absent
                {apercu.nbElementairesAbsents > 1 ? "s" : ""} de la liste (changement d&apos;école, nom écrit autrement…)
              </summary>
              <ul className="text-xs text-slate-600 list-disc pl-5 mt-1">
                {apercu.elementairesAbsents.map((c, i) => (
                  <li key={i}>{c.nom} ({c.classe})</li>
                ))}
              </ul>
            </details>
          )}
          <button
            onClick={appliquer}
            disabled={occupe || (apercu.aMettreAJour === 0 && !alignerClasse)}
            className="bg-sou-blue text-white font-semibold px-4 py-2 rounded-full disabled:opacity-50"
          >
            Appliquer ({apercu.aMettreAJour} niveau{apercu.aMettreAJour > 1 ? "x" : ""})
          </button>
        </div>
      )}
    </div>
  );
}

// Niveaux dans l'ordre de la scolarité (sert au filtre et au tri de la colonne).
const NIVEAUX_ORDRE = ["PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2"];
const rangNiveau = (n) => {
  const i = NIVEAUX_ORDRE.indexOf(n);
  return i === -1 ? NIVEAUX_ORDRE.length : i; // sans niveau : à la fin
};

function ListeEnfants({ token }) {
  const [familles, setFamilles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [classe, setClasse] = useState("toutes");
  const [niveau, setNiveau] = useState("tous"); // "tous" | un niveau | "aucun"
  const [tri, setTri] = useState({ colonne: "lastName", sens: 1 });

  const charger = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/admin/familles", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setFamilles(data.familles || []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    charger();
  }, [charger]);

  const annee = currentSchoolYear();

  const enfants = useMemo(() => {
    return familles.flatMap((f) => {
      const adhesion = f.memberships.find((m) => m.school_year === annee);
      const aJour = isMembershipValid(adhesion);
      const nomsParents = f.parents
        .map((p) => `${p.first_name || ""} ${p.last_name || ""}`.trim())
        .filter(Boolean);
      const familyName =
        nomsParents.length > 0
          ? nomsParents.join(" & ")
          : f.children.length > 0
          ? `Famille ${f.children[0].last_name}`
          : "Famille sans nom";

      return f.children
        .filter((c) => c.school_year === annee)
        .map((c) => ({
          id: c.id,
          firstName: c.first_name || "",
          lastName: c.last_name || "",
          classLevel: c.class_level || "",
          niveau: c.niveau || "",
          teacherName: enseignantDuNiveau(c.class_level) || c.teacher_name || "",
          schoolYear: c.school_year || "",
          familyName,
          familyId: f.id,
          aJour,
        }));
    });
  }, [familles, annee]);

  const classes = useMemo(() => {
    const set = new Set(enfants.map((e) => e.classLevel).filter(Boolean));
    return Array.from(set).sort();
  }, [enfants]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return enfants.filter((e) => {
      if (classe !== "toutes" && e.classLevel !== classe) return false;
      if (niveau === "aucun" ? Boolean(e.niveau) : niveau !== "tous" && e.niveau !== niveau) return false;
      if (!q) return true;
      return (
        e.firstName.toLowerCase().includes(q) ||
        e.lastName.toLowerCase().includes(q) ||
        e.familyName.toLowerCase().includes(q) ||
        e.classLevel.toLowerCase().includes(q) ||
        e.niveau.toLowerCase().includes(q) ||
        e.teacherName.toLowerCase().includes(q)
      );
    });
  }, [enfants, recherche, classe, niveau]);

  const tries = useMemo(() => {
    const copie = [...filtres];
    copie.sort((a, b) => {
      // Niveau : ordre de la scolarité (PS … CM2), pas l'ordre alphabétique.
      if (tri.colonne === "niveau") {
        return (rangNiveau(a.niveau) - rangNiveau(b.niveau)) * tri.sens || a.lastName.localeCompare(b.lastName, "fr");
      }
      const va = tri.colonne === "aJour" ? Number(a.aJour) : String(a[tri.colonne] || "");
      const vb = tri.colonne === "aJour" ? Number(b.aJour) : String(b[tri.colonne] || "");
      if (va < vb) return -1 * tri.sens;
      if (va > vb) return 1 * tri.sens;
      return 0;
    });
    return copie;
  }, [filtres, tri]);

  function basculerTri(colonne) {
    setTri((t) =>
      t.colonne === colonne ? { colonne, sens: -t.sens } : { colonne, sens: 1 }
    );
  }

  if (loading) {
    return <p className="text-slate-500">Chargement des enfants...</p>;
  }

  return (
    <div>
      <ImportNiveaux token={token} onDone={charger} />
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Rechercher un nom, un prénom, une famille, une classe..."
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="flex-1 min-w-[240px] border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={classe}
          onChange={(e) => setClasse(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="toutes">Toutes les classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={niveau}
          onChange={(e) => setNiveau(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="tous">Tous les niveaux</option>
          {NIVEAUX_ORDRE.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value="aucun">Sans niveau renseigné</option>
        </select>
      </div>

      <p className="text-sm text-slate-500 mb-3">
        {tries.length === enfants.length
          ? `${enfants.length} enfant${enfants.length > 1 ? "s" : ""}`
          : `${tries.length} / ${enfants.length} enfants`}
      </p>

      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {COLONNES.map((col) => (
                <th
                  key={col.key}
                  onClick={() => basculerTri(col.key)}
                  className="text-left px-4 py-3 font-semibold cursor-pointer select-none whitespace-nowrap"
                >
                  {col.label}
                  {tri.colonne === col.key && (tri.sens === 1 ? " ↑" : " ↓")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tries.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{e.lastName}</td>
                <td className="px-4 py-2">{e.firstName}</td>
                <td className="px-4 py-2">{e.classLevel || "—"}</td>
                <td className="px-4 py-2">{e.niveau || "—"}</td>
                <td className="px-4 py-2">{e.teacherName || "—"}</td>
                <td className="px-4 py-2">{e.familyName}</td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      e.aJour
                        ? "bg-green-50 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {e.aJour ? "À jour" : "Non cotisant"}
                  </span>
                </td>
              </tr>
            ))}
            {tries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Aucun enfant ne correspond à cette recherche.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
