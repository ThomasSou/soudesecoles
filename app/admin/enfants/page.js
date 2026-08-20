"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "../admin-shell";
import { currentSchoolYear, isMembershipValid } from "../../lib/anneeScolaire";

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
  { key: "teacherName", label: "Professeur" },
  { key: "familyName", label: "Famille" },
  { key: "aJour", label: "Cotisation" },
];

function ListeEnfants({ token }) {
  const [familles, setFamilles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [classe, setClasse] = useState("toutes");
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
      const familyName =
        f.parents.length > 0
          ? f.parents
              .map((p) => `${p.first_name || ""} ${p.last_name || ""}`.trim())
              .join(" & ")
          : f.children.length > 0
          ? `Famille ${f.children[0].last_name}`
          : "Famille sans nom";

      return f.children.map((c) => ({
        id: c.id,
        firstName: c.first_name || "",
        lastName: c.last_name || "",
        classLevel: c.class_level || "",
        teacherName: c.teacher_name || "",
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
      if (!q) return true;
      return (
        e.firstName.toLowerCase().includes(q) ||
        e.lastName.toLowerCase().includes(q) ||
        e.familyName.toLowerCase().includes(q) ||
        e.classLevel.toLowerCase().includes(q) ||
        e.teacherName.toLowerCase().includes(q)
      );
    });
  }, [enfants, recherche, classe]);

  const tries = useMemo(() => {
    const copie = [...filtres];
    copie.sort((a, b) => {
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
      </div>

      <p className="text-sm text-slate-500 mb-3">
        {tries.length} enfant{tries.length > 1 ? "s" : ""}
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
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
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
