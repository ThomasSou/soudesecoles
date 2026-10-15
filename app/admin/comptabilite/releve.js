"use client";

import { useCallback, useEffect, useState } from "react";
import { analyserReleve, decoderFichier, moyenDepuisType, tiersProbable } from "../../lib/releveCA";
import { currentSchoolYear } from "../../lib/anneeScolaire";

const euros = (cents) =>
  (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const dateFr = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

// Premier jour de l'année scolaire en cours : le bilan du Sou démarre au
// 1er septembre, c'est donc la borne par défaut de l'écran de pointage.
function debutAnneeCourante() {
  const debut = Number(currentSchoolYear().split("-")[0]);
  return `${debut}-09-01`;
}

const RUBRIQUES = { evenement: "Manifestation", investissement: "Investissement", courant: "Fonctionnement", classe: "Classe" };

// Relevé bancaire : import du fichier du Crédit Agricole et rapprochement avec
// les lignes de comptabilité. `LigneForm` est le formulaire de la page
// Comptabilité, réutilisé pour créer une ligne depuis une opération.
export default function ReleveBancaire({
  accessToken,
  LigneForm,
  evenements,
  annees,
  parents,
  fournisseurs,
  onChangeCompta,
}) {
  const [donnees, setDonnees] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [depuis, setDepuis] = useState(debutAnneeCourante());
  const [statut, setStatut] = useState("a_pointer");
  const [sens, setSens] = useState("");
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState("");
  const [apercu, setApercu] = useState(null);
  const [occupe, setOccupe] = useState(false);

  const entetes = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  const recharger = useCallback(() => {
    setChargement(true);
    const p = new URLSearchParams();
    if (depuis) p.set("depuis", depuis);
    if (statut) p.set("statut", statut);
    if (sens) p.set("sens", sens);
    fetch(`/api/admin/comptabilite/releve?${p}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then(setDonnees)
      .catch(() => setDonnees({ error: "Chargement impossible." }))
      .finally(() => setChargement(false));
  }, [accessToken, depuis, statut, sens]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  async function choisirFichier(e) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    setApercu(null);
    setMessage("");
    setErreur("");
    if (!fichier) return;
    try {
      const resultat = analyserReleve(decoderFichier(await fichier.arrayBuffer()));
      if (resultat.erreur) return setErreur(resultat.erreur);
      if (resultat.operations.length === 0) return setErreur("Aucune opération trouvée dans ce fichier.");
      setApercu({ nom: fichier.name, ...resultat });
    } catch {
      setErreur("Lecture du fichier impossible.");
    }
  }

  async function importer() {
    if (!apercu) return;
    setOccupe(true);
    setErreur("");
    const res = await fetch("/api/admin/comptabilite/releve", {
      method: "POST",
      headers: entetes,
      body: JSON.stringify({ operations: apercu.operations }),
    });
    const d = await res.json().catch(() => ({}));
    setOccupe(false);
    if (d.migrationManquante) return setDonnees({ migrationManquante: true });
    if (!res.ok) return setErreur(d.error || "Import impossible.");
    setApercu(null);
    setMessage(
      `${d.nouvelles} nouvelle${d.nouvelles > 1 ? "s" : ""} opération${d.nouvelles > 1 ? "s" : ""} importée${d.nouvelles > 1 ? "s" : ""}` +
        (d.connues ? `, ${d.connues} déjà connue${d.connues > 1 ? "s" : ""} (ignorée${d.connues > 1 ? "s" : ""})` : "") +
        `. Pointage automatique : ${d.pointeesAuto} rapprochement${d.pointeesAuto > 1 ? "s" : ""}.`
    );
    recharger();
    onChangeCompta?.();
  }

  async function relancerAuto() {
    setOccupe(true);
    setMessage("");
    const res = await fetch("/api/admin/comptabilite/releve", {
      method: "POST",
      headers: entetes,
      body: JSON.stringify({ relancer: true }),
    });
    const d = await res.json().catch(() => ({}));
    setOccupe(false);
    if (!res.ok) return setErreur(d.error || "Impossible de relancer le pointage.");
    setMessage(`Pointage automatique : ${d.pointeesAuto} rapprochement${d.pointeesAuto > 1 ? "s" : ""}.`);
    recharger();
    onChangeCompta?.();
  }

  const pilule = (actif, onClick, texte) => (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium ${
        actif ? "bg-sou-blue text-white" : "bg-white border border-slate-300 text-slate-600"
      }`}
    >
      {texte}
    </button>
  );

  if (donnees?.migrationManquante) {
    return (
      <div className="border border-amber-300 bg-amber-50 rounded-xl p-4 text-sm text-amber-900">
        La table du relevé bancaire n&apos;existe pas encore dans la base : la migration{" "}
        <strong>0054</strong> doit d&apos;abord être lancée dans Supabase.
      </div>
    );
  }

  const c = donnees?.compteurs;

  return (
    <div className="space-y-4">
      <p className="text-slate-500 text-sm">
        Importez le fichier des opérations téléchargé sur le site du Crédit Agricole (format CSV). Chaque
        opération est rapprochée toute seule d&apos;une dépense ou d&apos;une recette déjà saisie quand
        c&apos;est sûr (même montant et un seul candidat). Les autres restent <strong>à pointer</strong> :
        vous les rattachez à une ligne existante, ou vous créez la ligne (manifestation, investissement,
        fonctionnement, classe…). Importer deux fois la même période ne crée aucun doublon.
      </p>

      {/* Import */}
      <div className="border border-slate-200 rounded-xl p-4 space-y-3">
        <label className="inline-block bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full cursor-pointer">
          Importer un relevé (.csv)
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={choisirFichier} />
        </label>
        {apercu && (
          <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
            <p>
              <strong>{apercu.nom}</strong> — {apercu.intitule || "compte"} :{" "}
              <strong>{apercu.operations.length} opérations</strong>
              {apercu.periode?.du && apercu.periode?.au
                ? ` du ${dateFr(apercu.periode.du)} au ${dateFr(apercu.periode.au)}`
                : ""}
              .
            </p>
            <p className="text-slate-500">
              Dépenses :{" "}
              {euros(apercu.operations.filter((o) => o.sens === "depense").reduce((s, o) => s + o.montantCents, 0))} ·
              Recettes :{" "}
              {euros(apercu.operations.filter((o) => o.sens === "recette").reduce((s, o) => s + o.montantCents, 0))}
            </p>
            <div className="flex gap-2">
              <button
                onClick={importer}
                disabled={occupe}
                className="bg-green-600 text-white text-sm font-semibold px-4 py-1.5 rounded-full disabled:opacity-50"
              >
                {occupe ? "Import…" : "Importer et pointer"}
              </button>
              <button onClick={() => setApercu(null)} className="text-sm text-slate-500 px-3">
                Annuler
              </button>
            </div>
          </div>
        )}
        {message && <p className="text-sm text-green-700">{message}</p>}
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        {donnees?.error && <p className="text-sm text-red-600">{donnees.error}</p>}
      </div>

      {/* Filtres */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-500">Opérations depuis le</label>
          <input
            type="date"
            value={depuis}
            onChange={(e) => setDepuis(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          />
          <button onClick={() => setDepuis("")} className="text-xs text-slate-500 underline">
            tout afficher
          </button>
          <button
            onClick={relancerAuto}
            disabled={occupe}
            className="ml-auto text-sm border border-sou-blue text-sou-blue font-semibold px-3 py-1.5 rounded-full disabled:opacity-50"
          >
            Relancer le pointage automatique
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pilule(statut === "a_pointer", () => setStatut("a_pointer"), `À pointer${c ? ` (${c.a_pointer})` : ""}`)}
          {pilule(statut === "pointee", () => setStatut("pointee"), `Pointées${c ? ` (${c.pointee})` : ""}`)}
          {pilule(statut === "ignoree", () => setStatut("ignoree"), `Écartées${c ? ` (${c.ignoree})` : ""}`)}
          {pilule(statut === "", () => setStatut(""), "Toutes")}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pilule(sens === "", () => setSens(""), "Débits + crédits")}
          {pilule(sens === "depense", () => setSens("depense"), "Débits")}
          {pilule(sens === "recette", () => setSens("recette"), "Crédits")}
        </div>
        {c && c.a_pointer > 0 && (
          <p className="text-xs text-slate-500">
            {c.a_pointer} opération{c.a_pointer > 1 ? "s" : ""} à pointer sur la période, pour{" "}
            {euros(c.a_pointer_cents)} au total.
          </p>
        )}
      </div>

      {/* Opérations */}
      {chargement ? (
        <p className="text-slate-500 text-sm">Chargement…</p>
      ) : !donnees?.operations || donnees.operations.length === 0 ? (
        <p className="text-slate-500 text-sm">
          {statut === "a_pointer" && c && c.pointee > 0
            ? "Tout est pointé sur cette période."
            : "Aucune opération pour ces filtres."}
        </p>
      ) : (
        <div className="space-y-2">
          {donnees.tronque && (
            <p className="text-xs text-amber-700">Liste tronquée : réduisez la période pour tout voir.</p>
          )}
          {donnees.operations.map((op) => (
            <Operation
              key={op.id}
              op={op}
              accessToken={accessToken}
              entetes={entetes}
              lignesOuvertes={donnees.lignesOuvertes || []}
              LigneForm={LigneForm}
              evenements={evenements}
              annees={annees}
              parents={parents}
              fournisseurs={fournisseurs}
              onChange={() => {
                recharger();
                onChangeCompta?.();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Operation({
  op,
  accessToken,
  entetes,
  lignesOuvertes,
  LigneForm,
  evenements,
  annees,
  parents,
  fournisseurs,
  onChange,
}) {
  const [creation, setCreation] = useState(false);
  const [autre, setAutre] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const estDepense = op.sens === "depense";

  async function agir(corps) {
    setOccupe(true);
    setErreur("");
    const res = await fetch(`/api/admin/comptabilite/releve/${op.id}`, {
      method: "PATCH",
      headers: entetes,
      body: JSON.stringify(corps),
    });
    const d = await res.json().catch(() => ({}));
    setOccupe(false);
    if (!res.ok) return setErreur(d.error || "Action impossible.");
    onChange();
  }

  const ecart = (l) => (l.montant_cents === op.montant_cents ? "" : ` (${euros(l.montant_cents)})`);
  const libelleLigne = (l) =>
    `${l.fournisseur ? l.fournisseur + " — " : ""}${l.libelle}${l.date_operation ? ` · ${dateFr(l.date_operation)}` : ""}${ecart(l)}`;
  const autresLignes = lignesOuvertes.filter(
    (l) => l.sens === op.sens && !(op.suggestions || []).some((s) => s.id === l.id)
  );

  const [type, ...reste] = op.libelle.split(" — ");

  return (
    <div className="border border-slate-200 rounded-xl p-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="text-xs text-slate-500 w-20 shrink-0">{dateFr(op.date_operation)}</div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800">{type}</p>
          {reste.length > 0 && <p className="text-xs text-slate-500 break-words">{reste.join(" — ")}</p>}
        </div>
        <div className={`font-bold whitespace-nowrap ${estDepense ? "text-red-700" : "text-green-700"}`}>
          {estDepense ? "−" : "+"}
          {euros(op.montant_cents)}
        </div>
      </div>

      {op.statut === "pointee" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="bg-green-100 text-green-800 font-semibold px-2 py-0.5 rounded-full">
            Pointée{op.mode_pointage === "auto" ? " automatiquement" : ""}
          </span>
          {op.ligne && (
            <span className="text-slate-600">
              {RUBRIQUES[op.ligne.rubrique] || ""} · {op.ligne.fournisseur ? op.ligne.fournisseur + " — " : ""}
              {op.ligne.libelle}
            </span>
          )}
          <button
            onClick={() => agir({ action: "rouvrir" })}
            disabled={occupe}
            className="ml-auto text-slate-500 underline"
          >
            Annuler le pointage
          </button>
        </div>
      )}

      {op.statut === "ignoree" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">Écartée</span>
          {op.note && <span className="text-slate-500">{op.note}</span>}
          <button
            onClick={() => agir({ action: "rouvrir" })}
            disabled={occupe}
            className="ml-auto text-slate-500 underline"
          >
            Remettre à pointer
          </button>
        </div>
      )}

      {op.statut === "a_pointer" && !creation && (
        <div className="mt-3 space-y-2">
          {(op.suggestions || []).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Lignes déjà saisies qui pourraient correspondre :</p>
              {op.suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => agir({ action: "pointer", ligneId: s.id })}
                  disabled={occupe}
                  className="block w-full text-left border border-green-300 bg-green-50 hover:bg-green-100 rounded-lg px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  <span className="font-semibold">Pointer avec : </span>
                  {libelleLigne(s)}
                  <span className="text-green-800"> — {s.raisons.join(", ")}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setCreation(true)}
              className="bg-sou-blue text-white text-xs font-semibold px-3 py-1.5 rounded-full"
            >
              Créer la {estDepense ? "dépense" : "recette"}
            </button>
            <select
              value={autre}
              onChange={(e) => {
                const id = e.target.value;
                setAutre("");
                if (id) agir({ action: "pointer", ligneId: id });
              }}
              disabled={occupe}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs max-w-[16rem]"
            >
              <option value="">Pointer avec une autre ligne…</option>
              {autresLignes.map((l) => (
                <option key={l.id} value={l.id}>
                  {libelleLigne(l)}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const note = window.prompt(
                  "Écarter cette opération de la comptabilité (virement interne, erreur…). Pourquoi ? (facultatif)"
                );
                if (note !== null) agir({ action: "ignorer", note });
              }}
              disabled={occupe}
              className="text-xs text-slate-500 underline"
            >
              Écarter
            </button>
          </div>
          {erreur && <p className="text-xs text-red-600">{erreur}</p>}
        </div>
      )}

      {op.statut === "a_pointer" && creation && (
        <div className="mt-3">
          <LigneForm
            accessToken={accessToken}
            annees={annees}
            evenements={evenements}
            parents={parents}
            fournisseurs={fournisseurs}
            creation
            ligne={{
              sens: op.sens,
              rubrique: "evenement",
              libelle: (op.detail || op.libelle || "").split(" · ")[0],
              fournisseur: tiersProbable(op),
              montant_cents: op.montant_cents,
              date_operation: op.date_operation,
              compte: op.compte,
              statut: "a_verifier",
              // L'opération sort de notre compte : c'est le Sou qui a payé, et
              // la nature de l'opération (virement, prélèvement, chèque…) donne
              // le moyen de paiement.
              paye_par: "sou",
              paiement_statut: estDepense ? "paye" : undefined,
              moyen_paiement: estDepense ? moyenDepuisType(op.type_operation) : undefined,
              paiement_le: estDepense ? op.date_operation : undefined,
            }}
            onCancel={() => setCreation(false)}
            onDone={async (resultat) => {
              // La ligne vient d'être créée : on la rapproche aussitôt de l'opération.
              if (resultat?.id) {
                await agir({ action: "pointer", ligneId: resultat.id });
              } else {
                onChange();
              }
              setCreation(false);
            }}
          />
          {erreur && <p className="text-xs text-red-600 mt-1">{erreur}</p>}
        </div>
      )}
    </div>
  );
}
