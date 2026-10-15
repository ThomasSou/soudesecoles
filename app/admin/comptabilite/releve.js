"use client";

import { useCallback, useEffect, useState } from "react";
import { analyserReleve, decoderFichier, moyenDepuisType, tiersProbable } from "../../lib/releveCA";
import { currentSchoolYear } from "../../lib/anneeScolaire";

// Exercices proposables : celui d'après, l'en cours, celui d'avant.
function exercicesProposes() {
  const d = Number(currentSchoolYear().split("-")[0]);
  return [`${d + 1}-${d + 2}`, `${d}-${d + 1}`, `${d - 1}-${d}`];
}

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
        `. Pointage automatique : ${d.pointeesAuto} rapprochement${d.pointeesAuto > 1 ? "s" : ""}` +
        (d.apprises ? `, ${d.apprises} classée${d.apprises > 1 ? "s" : ""} comme la fois précédente` : "") +
        "."
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
    setMessage(
      `Pointage automatique : ${d.pointeesAuto} rapprochement${d.pointeesAuto > 1 ? "s" : ""}` +
        (d.apprises ? `, ${d.apprises} classée${d.apprises > 1 ? "s" : ""} comme la fois précédente` : "") +
        "."
    );
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
        Une table du relevé bancaire manque dans la base : la migration{" "}
        <strong>{donnees.migrationManquante === true ? "0054" : donnees.migrationManquante}</strong> doit
        d&apos;abord être lancée dans Supabase.
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
  // null | "creation" (formulaire complet) | "repartition" (répartition rapide)
  const [mode, setMode] = useState(null);
  const [autre, setAutre] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const estDepense = op.sens === "depense";
  const dejaRepartie = (op.lignes || []).length > 0;

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
    if (!res.ok) {
      setErreur(d.error || "Action impossible.");
      return false;
    }
    onChange();
    return true;
  }

  const ecart = (l) => (l.montant_cents === op.reste_cents ? "" : ` (${euros(l.montant_cents)})`);
  const libelleLigne = (l) =>
    `${l.fournisseur ? l.fournisseur + " — " : ""}${l.libelle}${l.date_operation ? ` · ${dateFr(l.date_operation)}` : ""}${ecart(l)}`;
  // Pour « une autre ligne » : toute ligne de même sens qui tient dans la part restante.
  const autresLignes = lignesOuvertes.filter(
    (l) =>
      l.sens === op.sens &&
      l.montant_cents <= op.reste_cents &&
      !(op.suggestions || []).some((s) => s.id === l.id)
  );

  const [type, ...details] = op.libelle.split(" — ");
  const nature = estDepense ? "dépense" : "recette";

  const listeLignes = (avecDetacher) => (
    <ul className="mt-2 space-y-1">
      {(op.lignes || []).map((l) => (
        <li key={l.id} className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-semibold">{euros(l.montant_cents)}</span>
          <span>
            {RUBRIQUES[l.rubrique] || ""} · {l.fournisseur ? l.fournisseur + " — " : ""}
            {l.libelle}
            {l.school_year ? ` · exercice ${l.school_year}` : ""}
          </span>
          {avecDetacher && (
            <button
              onClick={() => agir({ action: "detacher", ligneId: l.id })}
              disabled={occupe}
              className="ml-auto text-slate-400 underline"
            >
              Détacher
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="border border-slate-200 rounded-xl p-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="text-xs text-slate-500 w-20 shrink-0">{dateFr(op.date_operation)}</div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800">{type}</p>
          {details.length > 0 && <p className="text-xs text-slate-500 break-words">{details.join(" — ")}</p>}
        </div>
        <div className={`font-bold whitespace-nowrap ${estDepense ? "text-red-700" : "text-green-700"}`}>
          {estDepense ? "−" : "+"}
          {euros(op.montant_cents)}
        </div>
      </div>

      {op.statut === "pointee" && (
        <div className="mt-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-green-100 text-green-800 font-semibold px-2 py-0.5 rounded-full">
              Pointée{op.mode_pointage === "auto" ? " automatiquement" : ""}
              {(op.lignes || []).length > 1 ? ` · répartie sur ${op.lignes.length} lignes` : ""}
            </span>
            <button
              onClick={() => agir({ action: "rouvrir" })}
              disabled={occupe}
              className="ml-auto text-slate-500 underline"
            >
              Annuler le pointage
            </button>
          </div>
          {listeLignes(true)}
          {erreur && <p className="text-xs text-red-600 mt-1">{erreur}</p>}
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

      {op.statut === "a_pointer" && dejaRepartie && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-amber-700">
            Répartition en cours : il reste {euros(op.reste_cents)} à répartir.
          </p>
          {listeLignes(true)}
        </div>
      )}

      {op.statut === "a_pointer" && mode === null && (
        <div className="mt-3 space-y-2">
          {op.modele && (
            <button
              onClick={() => agir({ action: "modele" })}
              disabled={occupe}
              className="block w-full text-left border border-sou-blue/40 bg-sou-blue/5 hover:bg-sou-blue/10 rounded-lg px-3 py-1.5 text-xs disabled:opacity-50"
            >
              <span className="font-semibold">Classer comme la dernière fois : </span>
              {op.modele.kind === "ignorer"
                ? "écartée de la comptabilité"
                : [
                    RUBRIQUES[op.modele.rubrique],
                    op.modele.rubrique === "evenement"
                      ? op.modele.evenements.map((id) => evenements.find((e) => e.id === id)?.nom).filter(Boolean).join(" + ")
                      : op.modele.rubrique === "classe"
                        ? op.modele.classes.join(" + ")
                        : null,
                    op.modele.libelle || op.modele.fournisseur,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
              <span className="text-slate-500">
                {" "}
                (vu {op.modele.fois} fois)
              </span>
            </button>
          )}
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
              onClick={() => setMode("creation")}
              className="bg-sou-blue text-white text-xs font-semibold px-3 py-1.5 rounded-full"
            >
              Créer la {nature}
              {dejaRepartie ? ` (${euros(op.reste_cents)})` : ""}
            </button>
            <button
              onClick={() => setMode("repartition")}
              className="border border-sou-blue text-sou-blue text-xs font-semibold px-3 py-1.5 rounded-full"
            >
              Répartir sur plusieurs lignes
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
            {!dejaRepartie && (
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
            )}
          </div>
          {erreur && <p className="text-xs text-red-600">{erreur}</p>}
        </div>
      )}

      {op.statut === "a_pointer" && mode === "creation" && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 mb-2">
            Le montant de la ligne est modifiable : si vous le baissez, le reste de l&apos;opération
            ({euros(op.reste_cents)} au départ) restera à répartir sur d&apos;autres lignes.
          </p>
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
              montant_cents: op.reste_cents,
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
            onCancel={() => setMode(null)}
            onDone={async (resultat) => {
              // La ligne vient d'être créée : on la rapproche aussitôt de l'opération.
              if (resultat?.id) {
                await agir({ action: "pointer", ligneId: resultat.id });
              } else {
                onChange();
              }
              setMode(null);
            }}
          />
          {erreur && <p className="text-xs text-red-600 mt-1">{erreur}</p>}
        </div>
      )}

      {op.statut === "a_pointer" && mode === "repartition" && (
        <RepartitionRapide
          op={op}
          accessToken={accessToken}
          evenements={evenements}
          occupe={occupe}
          erreur={erreur}
          onAnnuler={() => setMode(null)}
          onValider={async (parts) => {
            const ok = await agir({ action: "repartir", parts });
            if (ok) setMode(null);
          }}
        />
      )}
    </div>
  );
}

// Répartition rapide : une opération (par exemple le virement global de
// HelloAsso) ventilée en plusieurs lignes de compta — manifestation,
// investissement ou fonctionnement —, créées d'un coup et pointées.
function RepartitionRapide({ op, accessToken, evenements, occupe, erreur, onAnnuler, onValider }) {
  const exercices = exercicesProposes();
  const exerciceDefaut = currentSchoolYear();
  const estDepense = op.sens === "depense";
  const centimes = (t) => {
    const n = Number(String(t || "").replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  };
  const vide = () => ({
    rubrique: "evenement",
    evenementId: "",
    libelle: "",
    montant: "",
    annee: exerciceDefaut,
  });
  const [parts, setParts] = useState([vide(), vide()]);
  const [fournisseur, setFournisseur] = useState(tiersProbable(op));
  const [localErr, setLocalErr] = useState("");
  const [lecture, setLecture] = useState(false);
  const [info, setInfo] = useState("");
  const [texteColle, setTexteColle] = useState("");
  const [afficheTexte, setAfficheTexte] = useState(false);
  const estHelloAsso = !estDepense && /helloasso/i.test(op.libelle);

  // Attestation de versement HelloAsso : préremplit une part par campagne.
  async function lireAttestation(corps) {
    setLecture(true);
    setLocalErr("");
    setInfo("");
    const res = await fetch("/api/admin/comptabilite/releve/helloasso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ operationId: op.id, ...corps }),
    });
    const d = await res.json().catch(() => ({}));
    setLecture(false);
    if (!res.ok) return setLocalErr(d.error || "Lecture impossible.");
    setFournisseur("HelloAsso");
    setParts(
      d.parts.map((p) => ({
        rubrique: p.rubrique,
        evenementId: p.evenementId || "",
        libelle: p.libelle,
        montant: (p.montantCents / 100).toFixed(2),
        annee: p.annee,
      }))
    );
    setInfo(
      `Attestation lue${d.numero ? ` (versement n°${d.numero})` : ""} : ${d.parts.length} part${d.parts.length > 1 ? "s" : ""} proposée${d.parts.length > 1 ? "s" : ""}. Vérifiez la rubrique de chacune (celles sans manifestation reconnue sont en « fonctionnement »).`
    );
  }

  async function choisirPdf(e) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    try {
      const pdf = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(fichier);
      });
      await lireAttestation({ pdf });
    } catch {
      setLocalErr("Lecture du fichier impossible.");
    }
  }

  const somme = parts.reduce((s, p) => s + centimes(p.montant), 0);
  const restant = op.reste_cents - somme;

  const maj = (i, champ, valeur) =>
    setParts((ps) => ps.map((p, j) => (j === i ? { ...p, [champ]: valeur } : p)));

  function completerDerniere() {
    if (restant <= 0) return;
    setParts((ps) => {
      const i = ps.length - 1;
      return ps.map((p, j) =>
        j === i ? { ...p, montant: ((centimes(p.montant) + restant) / 100).toFixed(2) } : p
      );
    });
  }

  function valider() {
    setLocalErr("");
    const utiles = parts.filter((p) => centimes(p.montant) > 0);
    if (utiles.length === 0) return setLocalErr("Indiquez au moins un montant.");
    for (const p of utiles) {
      if (!p.libelle.trim()) return setLocalErr("Chaque part a besoin d'un libellé.");
      if (p.rubrique === "evenement" && !p.evenementId) return setLocalErr("Choisissez la manifestation de chaque part.");
    }
    if (restant < 0) return setLocalErr("Les parts dépassent le montant de l'opération.");
    onValider(
      utiles.map((p) => ({
        rubrique: p.rubrique,
        evenementId: p.rubrique === "evenement" ? p.evenementId : null,
        libelle: p.libelle.trim(),
        fournisseur: fournisseur.trim(),
        montantCents: centimes(p.montant),
        annee: p.annee,
      }))
    );
  }

  const champ = "border border-slate-200 rounded-lg px-2 py-1.5 text-xs";

  return (
    <div className="mt-3 border border-sou-blue/30 bg-sou-blue/5 rounded-xl p-3 space-y-3">
      <p className="text-xs text-slate-600">
        Répartissez les <strong>{euros(op.reste_cents)}</strong> de cette {estDepense ? "dépense" : "recette"} sur
        plusieurs lignes (par exemple une par manifestation). Chaque ligne est créée et pointée d&apos;un coup.
      </p>

      {estHelloAsso && (
        <div className="bg-white border border-slate-200 rounded-lg p-2 text-xs space-y-1.5">
          <p>
            <strong>Virement HelloAsso :</strong> importez l&apos;attestation de versement (le PDF reçu de
            HelloAsso) pour répartir automatiquement par campagne.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-block bg-sou-blue text-white font-semibold px-3 py-1.5 rounded-full cursor-pointer">
              {lecture ? "Lecture…" : "Importer l'attestation (PDF)"}
              <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={choisirPdf} disabled={lecture} />
            </label>
            <button type="button" onClick={() => setAfficheTexte((v) => !v)} className="text-slate-500 underline">
              {afficheTexte ? "Masquer" : "ou coller le texte du PDF"}
            </button>
          </div>
          {afficheTexte && (
            <div className="space-y-1">
              <textarea
                value={texteColle}
                onChange={(e) => setTexteColle(e.target.value)}
                rows={4}
                placeholder="Ouvrez le PDF, Ctrl+A puis Ctrl+C, et collez ici"
                className="w-full border border-slate-200 rounded-lg p-2"
              />
              <button
                type="button"
                onClick={() => lireAttestation({ texte: texteColle })}
                disabled={lecture || !texteColle.trim()}
                className="border border-sou-blue text-sou-blue font-semibold px-3 py-1 rounded-full disabled:opacity-50"
              >
                Lire ce texte
              </button>
            </div>
          )}
          {info && <p className="text-green-700">{info}</p>}
        </div>
      )}

      <label className="block text-xs">
        {estDepense ? "Fournisseur" : "Origine"} (commun aux lignes)
        <input
          value={fournisseur}
          onChange={(e) => setFournisseur(e.target.value)}
          placeholder={estDepense ? "ex. Promocash" : "ex. HelloAsso"}
          className={`${champ} w-full mt-1`}
        />
      </label>

      <div className="space-y-2">
        {parts.map((p, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[9rem_1fr_1fr_6rem_6.5rem_auto] items-center">
            <select value={p.rubrique} onChange={(e) => maj(i, "rubrique", e.target.value)} className={champ}>
              <option value="evenement">Manifestation</option>
              <option value="investissement">Investissement</option>
              <option value="courant">Fonctionnement</option>
            </select>
            {p.rubrique === "evenement" ? (
              <select value={p.evenementId} onChange={(e) => maj(i, "evenementId", e.target.value)} className={champ}>
                <option value="">Quelle manifestation ?</option>
                {evenements.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.nom}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
            <input
              value={p.libelle}
              onChange={(e) => maj(i, "libelle", e.target.value)}
              placeholder="Libellé"
              className={champ}
            />
            <input
              value={p.montant}
              onChange={(e) => maj(i, "montant", e.target.value)}
              placeholder="Montant €"
              inputMode="decimal"
              className={`${champ} text-right`}
            />
            <select value={p.annee} onChange={(e) => maj(i, "annee", e.target.value)} className={champ} title="Exercice">
              {exercices.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            {parts.length > 1 ? (
              <button
                type="button"
                onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}
                className="text-xs text-slate-400 underline"
              >
                Retirer
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" onClick={() => setParts((ps) => [...ps, vide()])} className="text-sou-blue font-semibold underline">
          + Ajouter une part
        </button>
        <button type="button" onClick={completerDerniere} className="text-sou-blue underline">
          Mettre le reste dans la dernière part
        </button>
        <span className={restant === 0 ? "text-green-700 font-semibold" : restant < 0 ? "text-red-600 font-semibold" : "text-amber-700"}>
          {restant === 0
            ? "Tout est réparti ✓"
            : restant < 0
              ? `Dépassement de ${euros(-restant)}`
              : `Reste à répartir : ${euros(restant)}`}
        </span>
      </div>

      {(localErr || erreur) && <p className="text-xs text-red-600">{localErr || erreur}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={valider}
          disabled={occupe}
          className="bg-green-600 text-white text-sm font-semibold px-4 py-1.5 rounded-full disabled:opacity-50"
        >
          {occupe ? "Enregistrement…" : "Créer les lignes et pointer"}
        </button>
        <button type="button" onClick={onAnnuler} className="text-sm text-slate-500 px-3">
          Annuler
        </button>
      </div>
      {restant > 0 && (
        <p className="text-[11px] text-slate-400">
          Si vous ne répartissez qu&apos;une partie, le reste de l&apos;opération restera à pointer.
        </p>
      )}
    </div>
  );
}
