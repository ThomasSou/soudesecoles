"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "../../admin-shell";
import { RenduModules } from "../../../partenaires/RenduModules";

function dateFr(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function CartePage({ accessToken, page, onChange }) {
  const [motif, setMotif] = useState(page.motif_refus || "");
  const [envoi, setEnvoi] = useState(false);

  async function decider(decision) {
    if (decision === "refuse" && !motif.trim()) {
      alert("Indiquez un motif de refus.");
      return;
    }
    setEnvoi(true);
    const res = await fetch(`/api/admin/partenaire-pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ decision, motif }),
    });
    setEnvoi(false);
    if (res.ok) onChange();
    else alert((await res.json()).error || "Erreur.");
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <p className="font-semibold text-slate-800">{page.partenaireNom}</p>
      <p className="text-xs text-slate-500 mb-3">
        Envoyée le {dateFr(page.soumis_le)}
        {page.publie_le ? ` · dernière publication le ${dateFr(page.publie_le)}` : " · jamais publiée"}
      </p>
      {!page.slug && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          Attention : la fiche de ce partenaire n&apos;a pas d&apos;« adresse de page » (slug). Sans elle, la page
          validée ne s&apos;affichera pas sur le site. Renseignez-la dans sa fiche.
        </p>
      )}
      <div className="border border-dashed border-slate-300 rounded-lg p-4 bg-slate-50">
        <RenduModules contenu={page.brouillon} />
      </div>
      {page.statut === "soumis" && (
        <div className="mt-3 space-y-2">
          <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={2}
            placeholder="Motif (obligatoire pour un refus)"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button disabled={envoi} onClick={() => decider("valide")}
              className="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50">
              Valider et publier
            </button>
            <button disabled={envoi} onClick={() => decider("refuse")}
              className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50">
              Refuser
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Liste({ accessToken }) {
  const [pages, setPages] = useState(null);
  const [erreur, setErreur] = useState("");

  const charger = useCallback(() => {
    fetch("/api/admin/partenaire-pages", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((d) => (d.error ? setErreur(d.error) : setPages(d.pages)))
      .catch(() => setErreur("Chargement impossible."));
  }, [accessToken]);

  useEffect(() => { charger(); }, [charger]);

  return (
    <div>
      <Link href="/admin/partenaires" className="text-sm text-sou-blue hover:underline">← Partenaires</Link>
      <h1 className="text-2xl font-bold text-sou-blue mt-3 mb-1">Pages publiques à valider</h1>
      <p className="text-slate-500 text-sm mb-5">
        Les partenaires rédigent eux-mêmes leur page. Rien n&apos;est visible sur le site tant que vous n&apos;avez pas validé.
      </p>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      {pages && pages.length === 0 && <p className="text-slate-500 text-sm">Aucune page en attente.</p>}
      <div className="space-y-4">
        {(pages || []).map((p) => <CartePage key={p.id} accessToken={accessToken} page={p} onChange={charger} />)}
      </div>
    </div>
  );
}

export default function PagesPartenairesAdmin() {
  return <AdminShell title="Partenaires">{(accessToken) => <Liste accessToken={accessToken} />}</AdminShell>;
}
