"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../admin-shell";

function Bloc({ titre, valeur, precision }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{titre}</p>
      <p className="text-2xl font-bold text-sou-blue mt-1">{valeur}</p>
      {precision && <p className="text-xs text-slate-400 mt-1">{precision}</p>}
    </div>
  );
}

function Classement({ titre, lignes, vide }) {
  const max = Math.max(1, ...lignes.map((l) => l.count));
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="font-semibold text-sou-blue mb-3">{titre}</h3>
      {lignes.length === 0 ? (
        <p className="text-sm text-slate-400 italic">{vide}</p>
      ) : (
        <ul className="space-y-2">
          {lignes.map((l) => (
            <li key={l.target}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-700 truncate mr-3">{l.target}</span>
                <span className="text-slate-500 font-semibold">{l.count}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sou-blue rounded-full"
                  style={{ width: `${Math.round((l.count / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Statistiques({ accessToken }) {
  const [jours, setJours] = useState(30);
  const [data, setData] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur("");
    try {
      const res = await fetch(`/api/admin/stats?jours=${jours}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur de chargement.");
      setData(d);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setChargement(false);
    }
  }, [accessToken, jours]);

  useEffect(() => {
    charger();
  }, [charger]);

  if (chargement) return <p className="text-slate-500 text-sm">Chargement...</p>;
  if (erreur) return <p className="text-red-600 text-sm">{erreur}</p>;
  if (!data) return null;

  const maxCourbe = Math.max(1, ...data.courbe.map((c) => c.count));

  return (
    <div className="space-y-6">
      <div className="flex gap-2 text-sm">
        {[7, 30, 90, 365].map((n) => (
          <button
            key={n}
            onClick={() => setJours(n)}
            className={`px-3 py-1.5 rounded-full font-semibold ${
              jours === n ? "bg-sou-blue text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {n === 365 ? "1 an" : `${n} jours`}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <Bloc titre="Pages vues" valeur={data.totaux.pages} />
        <Bloc titre="Clics sortants" valeur={data.totaux.liens} precision="Partenaires, réseaux..." />
        <Bloc
          titre="E-mails ouverts"
          valeur={data.totaux.emailsOuverts}
          precision="Sous-estimé : beaucoup de messageries bloquent la mesure"
        />
        <Bloc titre="Clics dans les e-mails" valeur={data.totaux.emailsCliques} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-semibold text-sou-blue mb-4">Pages vues par jour</h3>
        {data.courbe.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Aucune donnée sur la période.</p>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {data.courbe.map((c) => (
              <div key={c.day} className="flex-1 group relative">
                <div
                  className="bg-sou-blue/80 rounded-t hover:bg-sou-blue transition-colors"
                  style={{ height: `${Math.round((c.count / maxCourbe) * 100)}%`, minHeight: "2px" }}
                  title={`${c.day} : ${c.count} pages vues`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Classement titre="Pages les plus consultées" lignes={data.pages} vide="Aucune page vue pour l'instant." />
        <Classement
          titre="Liens externes les plus cliqués"
          lignes={data.liens}
          vide="Aucun clic sortant pour l'instant."
        />
      </div>

      <p className="text-xs text-slate-400">
        Mesure réalisée sans cookie et sans adresse IP : seuls des compteurs par jour sont conservés,
        aucun visiteur n&apos;est identifié ni suivi d&apos;une page à l&apos;autre.
      </p>
    </div>
  );
}

export default function AdminStatistiquesPage() {
  return (
    <AdminShell title="Statistiques">
      {(token) => <Statistiques accessToken={token} />}
    </AdminShell>
  );
}
