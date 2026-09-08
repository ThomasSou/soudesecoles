"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../admin-shell";
import {
  CLASSES_REFERENCE,
  GROUPES_CLASSES,
  libelleClasse,
} from "../../lib/classesReference";
import { repartirEgal } from "../../lib/comptaRepartition";
import { currentSchoolYear } from "../../lib/anneeScolaire";

// Groupes de classes pour le sélecteur, construits directement depuis la
// référence (jamais dépendants de la réponse de l'API — le sélecteur ne
// peut donc pas se retrouver vide).
const GROUPES = Object.keys(GROUPES_CLASSES).map((g) => ({
  cle: g,
  nom: GROUPES_CLASSES[g],
  classes: CLASSES_REFERENCE.filter((c) => c.groupe === g).map((c) => ({
    cle: c.cle,
    libelle: libelleClasse(c.cle),
  })),
}));

const RUBRIQUES = {
  evenement: "Événement",
  investissement: "Investissement",
  courant: "Fonctionnement courant",
  classe: "Classe",
};

const STATUTS = {
  a_valider: { label: "À valider", classe: "bg-orange-50 text-orange-700" },
  prevu: { label: "Prévisionnel", classe: "bg-slate-100 text-slate-600" },
  a_verifier: { label: "À pointer", classe: "bg-amber-50 text-amber-700" },
  pointe: { label: "Pointé", classe: "bg-green-50 text-green-700" },
};

// Statuts que le bureau peut poser à la main via les boutons de cycle
// (« à valider » est réservé aux demandes bénévoles, piloté à part).
const STATUTS_CYCLE = ["prevu", "a_verifier", "pointe"];

const PAYE_PAR = { sou: "Le Sou", benevole: "Un bénévole" };

const REMBOURSEMENT_STATUT = {
  pending: "Remboursement à faire",
  reimbursed: "Remboursé",
  refused: "Refusé",
};

const COMPTES = { courant: "Compte courant", placement: "Compte placement" };

// Moyens de paiement d'une facture réglée par le Sou.
const MOYENS_PAIEMENT = {
  virement: "Virement",
  cheque: "Chèque",
  cb: "Carte bancaire",
  especes: "Espèces",
  prelevement: "Prélèvement",
  autre: "Autre",
};

function euros(cents) {
  return ((cents || 0) / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Justificatif accepté : image ou PDF (même limite que l'espace enseignant,
// contrôlée côté serveur : 8 Mo).
const TYPES_JUSTIF = "image/*,application/pdf";

// Nature du document joint. Le voyant ne passe au vert que sur une facture
// définitive.
const TYPES_DOC = {
  devis: "Devis",
  facture_provisoire: "Facture provisoire",
  facture_definitive: "Facture définitive",
};

// État du justificatif d'une ligne, pour le voyant et les libellés.
function voyantJustif(ligne) {
  if (ligne.a_justificatif_propre) {
    const t = ligne.justificatif_type;
    return {
      ok: t === "facture_definitive",
      label: TYPES_DOC[t] || "Document joint",
    };
  }
  if (ligne.a_justificatif) {
    const label =
      ligne.source === "benevole"
        ? "Facture bénévole"
        : ligne.source === "enseignant"
          ? "Facture enseignant"
          : "Facture jointe";
    return { ok: true, label };
  }
  return { ok: false, label: "Facture manquante" };
}

// Facture, en version courte pour la colonne du tableau.
function factureCourt(ligne) {
  const v = voyantJustif(ligne);
  if (ligne.sens === "recette" && !ligne.a_justificatif) {
    return { ok: null, label: "—" };
  }
  if (v.ok) return { ok: true, label: "Présente" };
  if (v.label === "Facture manquante") return { ok: false, label: "Manquante" };
  return { ok: false, label: v.label.replace(/^Facture /, "") };
}

// Règlement d'une ligne : une seule information, selon le cas.
//   - avancée par un bénévole -> à rembourser / remboursé
//   - dépense réglée par le Sou -> à payer / payée (moyen)
//   - le reste (recette, facture enseignant) -> rien
function reglementInfo(ligne) {
  if (ligne.paye_par === "benevole") {
    return ligne.rembourse
      ? { cle: "rembourse", label: "Remboursé", classe: "bg-green-50 text-green-700" }
      : { cle: "a_rembourser", label: "À rembourser", classe: "bg-amber-50 text-amber-700" };
  }
  if (ligne.paiement_concerne) {
    if (ligne.paiement_statut === "paye") {
      const moyen = ligne.moyen_paiement
        ? ` · ${MOYENS_PAIEMENT[ligne.moyen_paiement] || ligne.moyen_paiement}`
        : "";
      return { cle: "paye", label: `Payée${moyen}`, classe: "bg-green-50 text-green-700" };
    }
    return { cle: "a_payer", label: "À payer", classe: "bg-red-50 text-red-700" };
  }
  return { cle: "aucun", label: "—", classe: "text-slate-400" };
}

// Nom affiché pour le payeur d'une ligne.
function payeurNom(ligne, parents) {
  if (ligne.paye_par === "benevole") {
    return (
      (parents || []).find((p) => p.id === ligne.paye_par_parent_id)?.nom || "Un bénévole"
    );
  }
  return "Le Sou";
}

// Ordres de tri pour les colonnes à valeurs qualitatives.
const ORDRE_FACTURE = { manquante: 0, autre: 1, presente: 2, sansobjet: 3 };
const ORDRE_REGLEMENT = { a_payer: 0, a_rembourser: 1, paye: 2, rembourse: 3, aucun: 4 };
const ORDRE_STATUT = { prevu: 0, a_valider: 1, a_verifier: 2, pointe: 3 };

function rangFacture(ligne) {
  const f = factureCourt(ligne);
  if (f.ok === null) return ORDRE_FACTURE.sansobjet;
  if (f.ok) return ORDRE_FACTURE.presente;
  return f.label === "Manquante" ? ORDRE_FACTURE.manquante : ORDRE_FACTURE.autre;
}

// Comparateur de deux lignes selon la colonne triée. Les lignes sans date
// restent toujours en bas, quel que soit le sens.
function comparerLignes(tri, parents) {
  const signe = tri.sens === "asc" ? 1 : -1;
  return (a, b) => {
    if (tri.cle === "date") {
      const da = a.date_operation || "";
      const db = b.date_operation || "";
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? -signe : da > db ? signe : 0;
    }
    let va;
    let vb;
    if (tri.cle === "montant") {
      va = a.montant_cents;
      vb = b.montant_cents;
    } else if (tri.cle === "libelle") {
      return (a.libelle || "").localeCompare(b.libelle || "", "fr") * signe;
    } else if (tri.cle === "payeur") {
      va = (a.paye_par === "benevole" ? "1" : "0") + payeurNom(a, parents);
      vb = (b.paye_par === "benevole" ? "1" : "0") + payeurNom(b, parents);
      return String(va).localeCompare(String(vb), "fr") * signe;
    } else if (tri.cle === "facture") {
      va = rangFacture(a);
      vb = rangFacture(b);
    } else if (tri.cle === "reglement") {
      va = ORDRE_REGLEMENT[reglementInfo(a).cle];
      vb = ORDRE_REGLEMENT[reglementInfo(b).cle];
    } else if (tri.cle === "statut") {
      va = ORDRE_STATUT[a.statut] ?? 9;
      vb = ORDRE_STATUT[b.statut] ?? 9;
    } else {
      return 0;
    }
    return va < vb ? -signe : va > vb ? signe : 0;
  };
}

// Vrai au-dessus de 640 px de large : on affiche le tableau ; en dessous
// (téléphone en portrait), on repasse en tuiles.
function useEstLarge() {
  const [large, setLarge] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(min-width: 640px)");
    const maj = () => setLarge(mq.matches);
    maj();
    mq.addEventListener?.("change", maj);
    return () => mq.removeEventListener?.("change", maj);
  }, []);
  return large;
}

// Badge générique (même gabarit que les badges de statut).
function Badge({ label, classe, title }) {
  return (
    <span
      className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${classe}`}
      title={title}
    >
      {label}
    </span>
  );
}

// En-tête de colonne cliquable pour le tri.
function EnTeteTri({ cle, tri, setTri, align = "center", children }) {
  const actif = tri.cle === cle;
  const alignement =
    align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  return (
    <th
      onClick={() =>
        setTri((t) =>
          t.cle === cle
            ? { cle, sens: t.sens === "asc" ? "desc" : "asc" }
            : { cle, sens: cle === "libelle" || cle === "payeur" ? "asc" : "desc" }
        )
      }
      className={`px-2 py-2 font-medium cursor-pointer select-none whitespace-nowrap ${alignement} ${
        actif ? "text-slate-700" : ""
      }`}
    >
      {children}
      <span className="ml-0.5 text-[10px] text-slate-400">
        {actif ? (tri.sens === "asc" ? "▲" : "▼") : "▼"}
      </span>
    </th>
  );
}

// Sélecteur de parent avec recherche (tape les premières lettres du nom ou
// prénom) — la liste complète est trop longue pour un simple menu déroulant.
function SelecteurParent({ parents, valeur, onChange, champ }) {
  const [q, setQ] = useState("");
  const choisi = (parents || []).find((p) => p.id === valeur);
  if (choisi) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{choisi.nom}</span>
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-xs font-semibold text-sou-blue"
        >
          changer
        </button>
      </div>
    );
  }
  const res = (parents || [])
    .filter((p) => p.nom.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8);
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tapez le nom ou le prénom…"
        className={champ}
      />
      {q.trim() && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {res.length === 0 && (
            <span className="text-xs text-slate-400">Aucun résultat.</span>
          )}
          {res.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p.id);
                setQ("");
              }}
              className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white border border-slate-300 text-slate-600"
            >
              {p.nom}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Petit tableau récapitulatif (par classe ou par manifestation), réalisé
// d'un côté, prévisionnel de l'autre — jamais mélangés.
function Recap({ titre, entrees }) {
  const lignes = (entrees || [])
    .filter(
      (e) =>
        e.realise.depense_cents ||
        e.realise.recette_cents ||
        e.previsionnel.depense_cents ||
        e.previsionnel.recette_cents
    )
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  if (lignes.length === 0) return null;
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-slate-700 mb-1">{titre}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border border-slate-200 rounded-lg">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-2 py-1 font-medium">&nbsp;</th>
              <th className="text-right px-2 py-1 font-medium">Dépenses réalisées</th>
              <th className="text-right px-2 py-1 font-medium">Recettes réalisées</th>
              <th className="text-right px-2 py-1 font-medium">Prévisionnel</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((e) => {
              const prev = e.previsionnel.depense_cents - e.previsionnel.recette_cents;
              return (
                <tr key={e.label} className="border-t border-slate-100">
                  <td className="px-2 py-1">{e.label}</td>
                  <td className="px-2 py-1 text-right text-red-700">
                    {e.realise.depense_cents ? euros(e.realise.depense_cents) : "—"}
                  </td>
                  <td className="px-2 py-1 text-right text-green-700">
                    {e.realise.recette_cents ? euros(e.realise.recette_cents) : "—"}
                  </td>
                  <td className="px-2 py-1 text-right text-slate-500">
                    {prev ? euros(prev) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const centsVersTexte = (m) =>
  Object.fromEntries(Object.entries(m || {}).map(([k, v]) => [k, (v / 100).toFixed(2)]));

const texteVersCents = (v) =>
  Math.round((Number(String(v ?? "").replace(",", ".")) || 0) * 100);

// Éditeur de répartition d'un montant entre plusieurs classes / manifestations.
// items : [{ key, label }]. Masqué s'il y a moins de 2 éléments.
function RepartitionEditor({ mode, setMode, items, montants, setMontants, totalCents }) {
  if (items.length < 2) return null;
  const sommeCents = items.reduce((s, it) => s + texteVersCents(montants[it.key]), 0);
  const ok = mode !== "differenciee" || sommeCents === totalCents;
  const fmt = (c) =>
    (c / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
      <div className="flex flex-wrap gap-1.5">
        {[
          ["egale", "Répartition égale"],
          ["differenciee", "Montants différenciés"],
        ].map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              if (k === "differenciee") {
                const parts = repartirEgal(totalCents, items.length);
                const nv = { ...montants };
                items.forEach((it, i) => {
                  if (nv[it.key] == null || nv[it.key] === "") {
                    nv[it.key] = (parts[i] / 100).toFixed(2);
                  }
                });
                setMontants(nv);
              }
              setMode(k);
            }}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              mode === k
                ? "bg-sou-blue text-white"
                : "bg-white border border-slate-300 text-slate-600"
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {mode === "differenciee" && (
        <div className="space-y-1">
          {items.map((it) => (
            <div key={it.key} className="flex items-center gap-2 text-xs">
              <span className="flex-1 min-w-0 truncate">{it.label}</span>
              <input
                value={montants[it.key] ?? ""}
                inputMode="decimal"
                onChange={(e) => setMontants({ ...montants, [it.key]: e.target.value })}
                className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-right"
                placeholder="0,00"
              />
              <span className="text-slate-400">€</span>
            </div>
          ))}
          <p className={`text-xs font-semibold ${ok ? "text-green-700" : "text-red-600"}`}>
            Total réparti : {fmt(sommeCents)} € / montant de la ligne : {fmt(totalCents)} €
            {ok ? " ✓" : " — à ajuster"}
          </p>
        </div>
      )}
    </div>
  );
}

// Lit le fichier choisi et le renvoie en data URL base64, pour l'envoyer
// dans le corps JSON de la requête.
function lireFichier(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error("lecture impossible"));
    r.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Formulaire d'une ligne (création ou édition d'une ligne manuelle).
// ---------------------------------------------------------------------------
function LigneForm({ accessToken, annees, evenements, parents, ligne, onDone, onCancel }) {
  const edition = Boolean(ligne);
  const groupes = GROUPES;
  const anneesOptions = [
    ...new Set([
      currentSchoolYear(),
      ...(annees || []),
      ...(ligne?.school_year ? [ligne.school_year] : []),
    ]),
  ].sort().reverse();
  const [anneeLigne, setAnneeLigne] = useState(
    ligne?.school_year || currentSchoolYear()
  );
  const [sens, setSens] = useState(ligne?.sens || "depense");
  const [rubrique, setRubrique] = useState(ligne?.rubrique || "evenement");
  const [evenementsSel, setEvenementsSel] = useState(
    ligne?.evenements || (ligne?.evenement_id ? [ligne.evenement_id] : [])
  );
  const [evenementsLocaux, setEvenementsLocaux] = useState([]);
  const [nouvelleManif, setNouvelleManif] = useState("");
  const [classesSel, setClassesSel] = useState(ligne?.classes || []);
  const [repartitionClasses, setRepartitionClasses] = useState(
    ligne?.repartitionClasses || "egale"
  );
  const [classesMontants, setClassesMontants] = useState(
    centsVersTexte(ligne?.classesMontants)
  );
  const [repartitionEvenements, setRepartitionEvenements] = useState(
    ligne?.repartitionEvenements || "egale"
  );
  const [evenementsMontants, setEvenementsMontants] = useState(
    centsVersTexte(ligne?.evenementsMontants)
  );
  const [libelle, setLibelle] = useState(ligne?.libelle || "");
  const [fournisseur, setFournisseur] = useState(ligne?.fournisseur || "");
  const [montant, setMontant] = useState(
    ligne ? String((ligne.montant_cents / 100).toFixed(2)) : ""
  );
  const [dateOperation, setDateOperation] = useState(ligne?.date_operation || "");
  const [compte, setCompte] = useState(ligne?.compte || "");
  const [statut, setStatut] = useState(ligne?.statut || "a_verifier");
  const [payePar, setPayePar] = useState(ligne?.paye_par || "sou");
  const [payeParParentId, setPayeParParentId] = useState(ligne?.paye_par_parent_id || "");
  const [paiementStatut, setPaiementStatut] = useState(
    ligne?.paiement_statut === "paye" ? "paye" : "a_payer"
  );
  const [moyenPaiement, setMoyenPaiement] = useState(ligne?.moyen_paiement || "virement");
  const [paiementLe, setPaiementLe] = useState(ligne?.paiement_le || "");
  const [note, setNote] = useState(ligne?.note || "");
  const [justificatif, setJustificatif] = useState(null);
  const [justificatifType, setJustificatifType] = useState(
    ligne?.justificatif_type || "facture_definitive"
  );
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const tousEvenements = [
    ...evenements,
    ...evenementsLocaux.filter((e) => !evenements.some((x) => x.id === e.id)),
  ];

  function toggleEvenement(id) {
    setEvenementsSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function creerManifestation() {
    const nom = nouvelleManif.trim();
    if (!nom) return;
    setEnvoi(true);
    setErreur("");
    const res = await fetch("/api/admin/comptabilite/manifestations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ nom }),
    });
    const d = await res.json().catch(() => ({}));
    setEnvoi(false);
    if (!res.ok || !d.evenement) {
      setErreur(d.error || "Création de la manifestation impossible.");
      return;
    }
    setEvenementsLocaux((l) => [...l, d.evenement]);
    setEvenementsSel((s) => [...s, d.evenement.id]);
    setNouvelleManif("");
  }

  function toggleClasse(c) {
    setClassesSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  }
  function toggleGroupe(groupe) {
    const cles = groupe.classes.map((c) => c.cle);
    const toutes = cles.every((c) => classesSel.includes(c));
    setClassesSel((s) =>
      toutes ? s.filter((c) => !cles.includes(c)) : [...new Set([...s, ...cles])]
    );
  }

  const totalLigneCents = texteVersCents(montant);
  const sommeRepartie = (sel, montants) =>
    sel.reduce((s, k) => s + texteVersCents(montants[k]), 0);
  const classesDiffOk =
    rubrique !== "classe" ||
    repartitionClasses !== "differenciee" ||
    sommeRepartie(classesSel, classesMontants) === totalLigneCents;
  const evenementsDiffOk =
    rubrique !== "evenement" ||
    repartitionEvenements !== "differenciee" ||
    sommeRepartie(evenementsSel, evenementsMontants) === totalLigneCents;

  async function soumettre(e) {
    e.preventDefault();
    setErreur("");

    if (!classesDiffOk || !evenementsDiffOk) {
      setErreur(
        "La somme des montants répartis ne correspond pas au montant de la ligne."
      );
      return;
    }
    setEnvoi(true);

    let justificatifDataUrl = null;
    if (justificatif) {
      try {
        justificatifDataUrl = await lireFichier(justificatif);
      } catch {
        setErreur("Lecture du fichier impossible.");
        setEnvoi(false);
        return;
      }
    }

    const corps = {
      sens,
      rubrique,
      evenements: rubrique === "evenement" ? evenementsSel : [],
      classes: rubrique === "classe" ? classesSel : [],
      repartitionClasses: rubrique === "classe" ? repartitionClasses : undefined,
      classesMontants:
        rubrique === "classe" && repartitionClasses === "differenciee"
          ? classesMontants
          : undefined,
      repartitionEvenements: rubrique === "evenement" ? repartitionEvenements : undefined,
      evenementsMontants:
        rubrique === "evenement" && repartitionEvenements === "differenciee"
          ? evenementsMontants
          : undefined,
      libelle,
      fournisseur,
      montant: String(montant).replace(",", "."),
      dateOperation: dateOperation || null,
      compte: compte || null,
      statut,
      note,
      payePar,
      payeParParentId: payePar === "benevole" ? payeParParentId || null : null,
      paiementStatut: sens === "depense" && payePar === "sou" ? paiementStatut : undefined,
      moyenPaiement:
        sens === "depense" && payePar === "sou" && paiementStatut === "paye"
          ? moyenPaiement
          : undefined,
      paiementLe:
        sens === "depense" && payePar === "sou" && paiementStatut === "paye"
          ? paiementLe || null
          : undefined,
      justificatifDataUrl,
      justificatifType,
      annee: anneeLigne,
    };
    const url = edition
      ? `/api/admin/comptabilite/${ligne.id}`
      : "/api/admin/comptabilite";
    const res = await fetch(url, {
      method: edition ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(corps),
    });
    const data = await res.json().catch(() => ({}));
    setEnvoi(false);
    if (!res.ok) {
      setErreur(data.error || "Enregistrement impossible.");
      return;
    }
    onDone();
  }

  const champ = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm";

  return (
    <form
      onSubmit={soumettre}
      className="border border-sou-blue/30 bg-sou-blue/5 rounded-xl p-4 space-y-3"
    >
      <div className="flex gap-2">
        {["depense", "recette"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSens(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
              sens === s
                ? s === "depense"
                  ? "bg-red-600 text-white"
                  : "bg-green-600 text-white"
                : "bg-white border border-slate-300 text-slate-600"
            }`}
          >
            {s === "depense" ? "Dépense" : "Recette"}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">
          Rubrique
          <select
            value={rubrique}
            onChange={(e) => setRubrique(e.target.value)}
            className={champ}
          >
            {Object.entries(RUBRIQUES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rubrique === "evenement" && (
        <div className="text-sm space-y-2">
          <p>
            Manifestation(s) concernée(s){" "}
            <span className="text-slate-400">
              — réparti à parts égales, sauf montants différenciés
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tousEvenements.length === 0 && (
              <span className="text-slate-400 text-xs">
                Aucune manifestation. Ajoutez-en une ci-dessous.
              </span>
            )}
            {tousEvenements.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => toggleEvenement(ev.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  evenementsSel.includes(ev.id)
                    ? "bg-sou-blue text-white"
                    : "bg-white border border-slate-300 text-slate-600"
                }`}
              >
                {ev.nom}
              </button>
            ))}
          </div>
          <RepartitionEditor
            mode={repartitionEvenements}
            setMode={setRepartitionEvenements}
            items={evenementsSel.map((id) => ({
              key: id,
              label: tousEvenements.find((e) => e.id === id)?.nom || "Manifestation",
            }))}
            montants={evenementsMontants}
            setMontants={setEvenementsMontants}
            totalCents={totalLigneCents}
          />
          <div className="flex gap-2">
            <input
              value={nouvelleManif}
              onChange={(e) => setNouvelleManif(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  creerManifestation();
                }
              }}
              className={champ}
              placeholder="Nouvelle manifestation (ex. Vide-greniers 2026)"
            />
            <button
              type="button"
              onClick={creerManifestation}
              disabled={envoi || !nouvelleManif.trim()}
              className="shrink-0 text-xs font-semibold text-sou-blue px-3 border border-sou-blue/40 rounded-lg disabled:opacity-40"
            >
              Ajouter
            </button>
          </div>
        </div>
      )}

      {rubrique === "classe" && (
        <div className="text-sm space-y-2">
          <p>
            Classe(s) concernée(s){" "}
            <span className="text-slate-400">
              — le montant est réparti à parts égales entre les classes cochées
            </span>
          </p>
          {groupes.map((g) => {
            const cles = g.classes.map((c) => c.cle);
            const toutes = cles.length > 0 && cles.every((c) => classesSel.includes(c));
            return (
              <div key={g.cle}>
                <button
                  type="button"
                  onClick={() => toggleGroupe(g)}
                  className="text-xs font-semibold text-sou-blue"
                >
                  {toutes ? "Décocher" : "Cocher"} toutes les {g.nom.toLowerCase()}s
                </button>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {g.classes.map((c) => (
                    <button
                      key={c.cle}
                      type="button"
                      onClick={() => toggleClasse(c.cle)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        classesSel.includes(c.cle)
                          ? "bg-sou-blue text-white"
                          : "bg-white border border-slate-300 text-slate-600"
                      }`}
                    >
                      {c.libelle}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <RepartitionEditor
            mode={repartitionClasses}
            setMode={setRepartitionClasses}
            items={classesSel.map((c) => ({ key: c, label: libelleClasse(c) }))}
            montants={classesMontants}
            setMontants={setClassesMontants}
            totalCents={totalLigneCents}
          />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">
          Libellé
          <input
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            className={champ}
            placeholder="Location camion, facture boucher…"
          />
        </label>
        <label className="text-sm">
          Fournisseur (facultatif)
          <input
            value={fournisseur}
            onChange={(e) => setFournisseur(e.target.value)}
            className={champ}
          />
        </label>
        <label className="text-sm">
          Montant (€ TTC)
          <input
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            className={champ}
            inputMode="decimal"
            placeholder="0,00"
          />
        </label>
        <label className="text-sm">
          Date de l&apos;opération (facultatif)
          <input
            type="date"
            value={dateOperation}
            onChange={(e) => setDateOperation(e.target.value)}
            className={champ}
          />
        </label>
        <label className="text-sm">
          Compte bancaire (facultatif)
          <select
            value={compte}
            onChange={(e) => setCompte(e.target.value)}
            className={champ}
          >
            <option value="">—</option>
            {Object.entries(COMPTES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Statut
          <select
            value={statut}
            onChange={(e) => setStatut(e.target.value)}
            className={champ}
          >
            {STATUTS_CYCLE.map((k) => (
              <option key={k} value={k}>
                {STATUTS[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Année scolaire{" "}
          <span className="text-slate-400">(pré-remplie sur l&apos;année en cours)</span>
          <select
            value={anneeLigne}
            onChange={(e) => setAnneeLigne(e.target.value)}
            className={champ}
          >
            {anneesOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="text-sm space-y-2">
        <p>Payé par</p>
        <div className="flex gap-1.5">
          {Object.entries(PAYE_PAR).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setPayePar(k)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                payePar === k
                  ? "bg-sou-blue text-white"
                  : "bg-white border border-slate-300 text-slate-600"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        {payePar === "benevole" && (
          <SelecteurParent
            parents={parents}
            valeur={payeParParentId}
            onChange={setPayeParParentId}
            champ={champ}
          />
        )}
      </div>

      {/* Règlement — seulement pour une dépense payée par le Sou. Une avance
          bénévole suit son propre circuit (remboursement). */}
      {sens === "depense" && payePar === "sou" && (
        <div className="text-sm space-y-2">
          <p>Règlement de la facture</p>
          <div className="flex gap-1.5">
            {[
              ["a_payer", "À payer"],
              ["paye", "Payée"],
            ].map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPaiementStatut(k)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  paiementStatut === k
                    ? "bg-sou-blue text-white"
                    : "bg-white border border-slate-300 text-slate-600"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          {paiementStatut === "paye" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">
                Moyen de paiement
                <select
                  value={moyenPaiement}
                  onChange={(e) => setMoyenPaiement(e.target.value)}
                  className={champ}
                >
                  {Object.entries(MOYENS_PAIEMENT).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Date du paiement (facultatif)
                <input
                  type="date"
                  value={paiementLe}
                  onChange={(e) => setPaiementLe(e.target.value)}
                  className={champ}
                />
              </label>
            </div>
          )}
        </div>
      )}

      <label className="text-sm block">
        Note interne (facultatif)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className={champ}
        />
      </label>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm block">
          Justificatif — devis ou facture (PDF ou image, facultatif)
          {edition && ligne?.a_justificatif_propre && (
            <span className="block text-xs text-green-700">
              Un document est déjà joint. En choisir un nouveau le remplacera.
            </span>
          )}
          <input
            type="file"
            accept={TYPES_JUSTIF}
            onChange={(e) => setJustificatif(e.target.files?.[0] || null)}
            className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-sou-blue/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-sou-blue"
          />
        </label>
        <label className="text-sm block">
          Nature du document
          <select
            value={justificatifType}
            onChange={(e) => setJustificatifType(e.target.value)}
            className={champ}
          >
            {Object.entries(TYPES_DOC).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {justificatif && justificatifType === "devis" && (
            <span className="block text-xs text-slate-500">
              La ligne sera enregistrée en <strong>prévisionnel</strong> tant
              qu&apos;une facture ne remplace pas le devis.
            </span>
          )}
        </label>
      </div>

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={envoi || !classesDiffOk || !evenementsDiffOk}
          className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50"
        >
          {edition ? "Enregistrer" : "Ajouter la ligne"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-slate-500 px-3"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Une ligne dans la liste.
// ---------------------------------------------------------------------------
function LigneRow({
  accessToken,
  ligne,
  evenements,
  annees,
  parents,
  onChange,
  vue = "carte",
}) {
  const [edition, setEdition] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [deroule, setDeroule] = useState(false);
  const statut = STATUTS[ligne.statut] || STATUTS.a_verifier;
  const voyant = voyantJustif(ligne);
  const reglement = reglementInfo(ligne);
  const factCourt = factureCourt(ligne);
  const idsEvenement =
    ligne.evenements && ligne.evenements.length
      ? ligne.evenements
      : ligne.evenement_id
        ? [ligne.evenement_id]
        : [];
  const evtDiff = ligne.repartitionEvenements === "differenciee";
  const nomEvenement =
    ligne.rubrique === "evenement"
      ? idsEvenement
          .map((id) => {
            const n = evenements.find((e) => e.id === id)?.nom || "Manifestation";
            return evtDiff ? `${n} (${euros(ligne.evenementsMontants?.[id] || 0)})` : n;
          })
          .join(", ")
      : null;
  const classeDiff = ligne.repartitionClasses === "differenciee";

  async function patch(corps) {
    setEnvoi(true);
    const res = await fetch(`/api/admin/comptabilite/${ligne.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(corps),
    });
    setEnvoi(false);
    if (res.ok) onChange();
    else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Modification impossible.");
    }
  }

  async function joindreJustificatif(file) {
    if (!file) return;
    let dataUrl;
    try {
      dataUrl = await lireFichier(file);
    } catch {
      alert("Lecture du fichier impossible.");
      return;
    }
    patch({ justificatifDataUrl: dataUrl });
  }

  async function retirerJustificatif() {
    if (!confirm("Retirer le justificatif joint à cette ligne ?")) return;
    patch({ retirerJustificatif: true });
  }

  async function voirJustificatif() {
    const res = await fetch(`/api/admin/comptabilite/${ligne.id}/fichier`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.url) window.open(d.url, "_blank", "noopener");
    else alert(d.error || "Justificatif indisponible.");
  }

  async function supprimer() {
    if (!confirm("Supprimer cette ligne ?")) return;
    setEnvoi(true);
    const res = await fetch(`/api/admin/comptabilite/${ligne.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setEnvoi(false);
    if (res.ok) onChange();
    else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Suppression impossible.");
    }
  }

  // Rattachement en une ligne de texte (manifestation(s) + classe(s)).
  const rattachement = [
    nomEvenement,
    ligne.rubrique === "classe" && ligne.classes.length
      ? ligne.classes
          .map((c) =>
            classeDiff
              ? `${libelleClasse(c)} (${euros(ligne.classesMontants?.[c] || 0)})`
              : libelleClasse(c)
          )
          .join(", ")
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (edition) {
    const form = (
      <LigneForm
        accessToken={accessToken}
        annees={annees}
        evenements={evenements}
        parents={parents}
        ligne={ligne}
        onDone={() => {
          setEdition(false);
          onChange();
        }}
        onCancel={() => setEdition(false)}
      />
    );
    return vue === "tableau" ? (
      <tr>
        <td colSpan={8} className="p-2">
          {form}
        </td>
      </tr>
    ) : (
      form
    );
  }

  // En-tête (vue carte) : libellé + rattachement à gauche, montant + badges
  // à droite.
  const enTete = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium text-slate-800">{ligne.libelle}</p>
        <p className="text-xs text-slate-500">
          <span className="inline-block bg-slate-100 rounded px-1.5 py-0.5 mr-1">
            {RUBRIQUES[ligne.rubrique]}
          </span>
          {rattachement && <span>{rattachement}</span>}
          {ligne.fournisseur && <span> · {ligne.fournisseur}</span>}
          {ligne.source === "enseignant" && (
            <span className="text-sou-blue"> · facture enseignant</span>
          )}
          {ligne.paye_par === "benevole" && (
            <span className="text-amber-700"> · avancé par {payeurNom(ligne, parents)}</span>
          )}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p
          className={`font-semibold ${
            ligne.sens === "recette" ? "text-green-700" : "text-red-700"
          }`}
        >
          {ligne.sens === "recette" ? "+" : "−"} {euros(ligne.montant_cents)}
        </p>
        <p className="text-xs text-slate-400">{formatDate(ligne.date_operation)}</p>
        <div className="flex flex-col items-end gap-1 mt-0.5">
          <Badge label={statut.label} classe={statut.classe} />
          <Badge
            label={voyant.label}
            classe={voyant.ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}
            title={
              ligne.a_justificatif && !ligne.a_justificatif_propre
                ? "Justificatif repris de la facture / demande liée"
                : undefined
            }
          />
          {reglement.cle !== "aucun" && (
            <Badge label={reglement.label} classe={reglement.classe} />
          )}
        </div>
      </div>
    </div>
  );

  // Bloc des actions : identique en vue carte et dans le détail déroulé du
  // tableau.
  const blocActions = (
    <>
      {ligne.paye_par === "benevole" && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs">
          {ligne.source === "benevole" && (
            <span className="font-semibold text-slate-500">Demande bénévole</span>
          )}
          {ligne.source === "benevole" && ligne.statut === "a_valider" && (
            <>
              <button
                onClick={() => patch({ statut: "a_verifier" })}
                disabled={envoi}
                className="font-semibold text-white bg-sou-blue px-2.5 py-1 rounded-full disabled:opacity-40"
              >
                Valider
              </button>
              <button
                onClick={() => {
                  if (confirm("Refuser cette demande ? La ligne sera retirée de la compta."))
                    patch({ refuserRemboursement: true });
                }}
                disabled={envoi}
                className="font-semibold text-red-600 px-2 disabled:opacity-40"
              >
                Refuser
              </button>
            </>
          )}
          {ligne.rembourse ? (
            <>
              <span className="text-green-700 font-semibold">
                Remboursé{ligne.rembourse_le ? ` le ${formatDate(ligne.rembourse_le)}` : ""}
              </span>
              <button
                onClick={() => {
                  if (confirm("Annuler le remboursement ?"))
                    patch({ annulerRemboursement: true });
                }}
                disabled={envoi}
                className="text-slate-400 px-1 disabled:opacity-40"
              >
                annuler
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                if (
                  confirm(
                    "Marquer ce remboursement comme effectué ?" +
                      (ligne.source === "benevole"
                        ? " Il apparaîtra sur la fiche du bénévole."
                        : "")
                  )
                )
                  patch({ rembourser: true });
              }}
              disabled={envoi}
              className="font-semibold text-white bg-sou-blue px-2.5 py-1 rounded-full disabled:opacity-40"
            >
              Marquer remboursé
            </button>
          )}
        </div>
      )}

      {ligne.paiement_concerne && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs">
          {ligne.paiement_statut === "paye" ? (
            <>
              <span className="text-green-700 font-semibold">
                Payée
                {ligne.moyen_paiement
                  ? ` par ${(MOYENS_PAIEMENT[ligne.moyen_paiement] || ligne.moyen_paiement).toLowerCase()}`
                  : ""}
                {ligne.paiement_le ? ` le ${formatDate(ligne.paiement_le)}` : ""}
              </span>
              <button
                onClick={() => patch({ paiementStatut: "a_payer" })}
                disabled={envoi}
                className="text-slate-400 px-1 disabled:opacity-40"
              >
                annuler
              </button>
            </>
          ) : (
            <>
              <span className="font-semibold text-slate-500">Marquer payée :</span>
              {Object.entries(MOYENS_PAIEMENT).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => patch({ paiementStatut: "paye", moyenPaiement: k })}
                  disabled={envoi}
                  className="font-semibold text-sou-blue border border-sou-blue/40 px-2 py-0.5 rounded-full disabled:opacity-40"
                >
                  {v}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {(ligne.source === "benevole" ? ligne.statut !== "a_valider" : true) &&
          STATUTS_CYCLE.map((k) => (
            <button
              key={k}
              disabled={envoi || ligne.statut === k}
              onClick={() => patch({ statut: k })}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full disabled:opacity-40 ${
                ligne.statut === k
                  ? STATUTS[k].classe
                  : "border border-slate-300 text-slate-600"
              }`}
            >
              {STATUTS[k].label}
            </button>
          ))}

        {ligne.source === "manuel" && (
          <>
            <button
              onClick={() => setEdition(true)}
              className="text-xs font-semibold text-sou-blue px-2"
            >
              Éditer
            </button>
            <button
              onClick={supprimer}
              disabled={envoi}
              className="text-xs font-semibold text-red-600 px-2 disabled:opacity-40"
            >
              Supprimer
            </button>
          </>
        )}

        <span className="mx-1 text-slate-300">|</span>

        {ligne.a_justificatif && (
          <button
            onClick={voirJustificatif}
            className="text-xs font-semibold text-sou-blue px-2"
          >
            Voir le document
          </button>
        )}
        <label className="text-xs font-semibold text-sou-blue px-2 cursor-pointer">
          {ligne.a_justificatif_propre ? "Remplacer" : "Joindre un document"}
          <input
            type="file"
            accept={TYPES_JUSTIF}
            disabled={envoi}
            className="hidden"
            onChange={(e) => {
              joindreJustificatif(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {ligne.a_justificatif_propre && (
          <>
            <select
              value={ligne.justificatif_type || "facture_definitive"}
              disabled={envoi}
              onChange={(e) => patch({ justificatifType: e.target.value })}
              className="text-xs border border-slate-300 rounded-full px-2 py-1 text-slate-600 disabled:opacity-40"
              title="Nature du document joint"
            >
              {Object.entries(TYPES_DOC).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button
              onClick={retirerJustificatif}
              disabled={envoi}
              className="text-xs font-semibold text-red-600 px-2 disabled:opacity-40"
            >
              Retirer
            </button>
          </>
        )}
      </div>

      {ligne.statut === "pointe" && (
        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-100">
          <select
            defaultValue={ligne.compte || ""}
            onChange={(e) => patch({ compte: e.target.value || null })}
            className="border border-slate-200 rounded-lg px-2 py-1 text-xs"
          >
            <option value="">Compte —</option>
            {Object.entries(COMPTES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            defaultValue={ligne.ref_bancaire || ""}
            onBlur={(e) => {
              if ((e.target.value || "") !== (ligne.ref_bancaire || ""))
                patch({ refBancaire: e.target.value });
            }}
            placeholder="Référence sur le relevé"
            className="flex-1 min-w-[10rem] border border-slate-200 rounded-lg px-2 py-1 text-xs"
          />
        </div>
      )}
    </>
  );

  if (vue === "tableau") {
    return (
      <>
        <tr
          onClick={() => setDeroule((d) => !d)}
          className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer align-middle"
        >
          <td className="px-2 py-2 text-center text-slate-400">{deroule ? "▾" : "▸"}</td>
          <td className="px-2 py-2 text-slate-500 whitespace-nowrap">
            {ligne.date_operation ? formatDate(ligne.date_operation) : "—"}
          </td>
          <td className="px-2 py-2">
            <div className="font-medium text-slate-800 truncate">{ligne.libelle}</div>
            <div className="text-[11px] text-slate-400 truncate">
              {RUBRIQUES[ligne.rubrique]}
              {rattachement ? ` · ${rattachement}` : ""}
            </div>
          </td>
          <td className="px-2 py-2">
            <div className="truncate">{payeurNom(ligne, parents)}</div>
            {ligne.paye_par === "benevole" && (
              <div className="text-[11px] text-amber-700">avance</div>
            )}
            {ligne.source === "enseignant" && (
              <div className="text-[11px] text-sou-blue">facture enseignant</div>
            )}
          </td>
          <td className="px-2 py-2 text-center">
            {factCourt.ok === null ? (
              <span className="text-slate-300">—</span>
            ) : (
              <Badge
                label={factCourt.label}
                classe={
                  factCourt.ok
                    ? "bg-green-50 text-green-700"
                    : "bg-amber-50 text-amber-700"
                }
                title={
                  ligne.a_justificatif && !ligne.a_justificatif_propre
                    ? "Justificatif repris de la facture / demande liée"
                    : undefined
                }
              />
            )}
          </td>
          <td className="px-2 py-2 text-center">
            {reglement.cle === "aucun" ? (
              <span className="text-slate-300">—</span>
            ) : (
              <Badge label={reglement.label} classe={reglement.classe} />
            )}
          </td>
          <td className="px-2 py-2 text-center">
            <Badge label={statut.label} classe={statut.classe} />
          </td>
          <td
            className={`px-2 py-2 text-right font-semibold whitespace-nowrap ${
              ligne.sens === "recette" ? "text-green-700" : "text-red-700"
            }`}
          >
            {ligne.sens === "recette" ? "+" : "−"} {euros(ligne.montant_cents)}
          </td>
        </tr>
        {deroule && (
          <tr className="bg-slate-50">
            <td />
            <td colSpan={7} className="px-2 pb-3 pt-1">
              {(rattachement || ligne.fournisseur || ligne.note) && (
                <p className="text-xs text-slate-500">
                  {[rattachement, ligne.fournisseur, ligne.note]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {blocActions}
            </td>
          </tr>
        )}
      </>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl p-3">
      {enTete}
      {blocActions}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page.
// ---------------------------------------------------------------------------
function ComptaAdmin({ accessToken }) {
  const [annee, setAnnee] = useState("");
  const [data, setData] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [rubrique, setRubrique] = useState("");
  const [evenementId, setEvenementId] = useState("");
  const [classe, setClasse] = useState("");
  const [statut, setStatut] = useState("");
  const [sens, setSens] = useState("");
  const [ajout, setAjout] = useState(false);
  const [tri, setTri] = useState({ cle: "date", sens: "desc" });
  const estLarge = useEstLarge();

  const recharger = useCallback(() => {
    setChargement(true);
    const p = new URLSearchParams();
    if (annee) p.set("annee", annee);
    if (rubrique) p.set("rubrique", rubrique);
    if (rubrique === "evenement" && evenementId) p.set("evenementId", evenementId);
    if (rubrique === "classe" && classe) p.set("classe", classe);
    if (statut) p.set("statut", statut);
    if (sens) p.set("sens", sens);
    fetch(`/api/admin/comptabilite?${p.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (!annee && d.annee) setAnnee(d.annee);
      })
      .finally(() => setChargement(false));
  }, [accessToken, annee, rubrique, evenementId, classe, statut, sens]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  const totaux = data?.totaux?.global || { depense_cents: 0, recette_cents: 0 };
  const solde = totaux.recette_cents - totaux.depense_cents;
  const aVerifier = data?.totaux?.parStatut?.a_verifier;
  const pointe = data?.totaux?.parStatut?.pointe;
  const previsionnel = data?.totaux?.parStatut?.prevu;
  const aValider = data?.totaux?.parStatut?.a_valider;
  const aPayer = data?.totaux?.aPayer;
  const entreesClasses = Object.entries(data?.totaux?.parClasse || {}).map(([cle, v]) => ({
    label: v.libelle || libelleClasse(cle),
    realise: v.realise,
    previsionnel: v.previsionnel,
  }));
  const entreesEvenements = Object.entries(data?.totaux?.parEvenement || {}).map(([id, v]) => ({
    label: v.nom || "Manifestation",
    realise: v.realise,
    previsionnel: v.previsionnel,
  }));
  const aRembourser = Object.values(data?.totaux?.parBenevole || {})
    .filter((v) => v.montant_cents > 0)
    .sort((a, b) => b.montant_cents - a.montant_cents);

  // Lignes de la liste, triées selon la colonne choisie (le filtrage, lui,
  // se fait côté serveur via les pilules du haut).
  const lignesTriees = data?.lignes
    ? [...data.lignes].sort(comparerLignes(tri, data.parents || []))
    : [];

  const pilule = (actif, onClick, texte) => (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium ${
        actif
          ? "bg-sou-blue text-white"
          : "bg-white border border-slate-300 text-slate-600"
      }`}
    >
      {texte}
    </button>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-sou-blue mb-1">Comptabilité</h1>
      <p className="text-slate-500 text-sm mb-6">
        Dépenses et recettes de l&apos;association, par événement, par classe,
        en investissement ou en fonctionnement courant. Tout est en TTC. Les
        factures des enseignants et les demandes de remboursement des bénévoles
        apparaissent automatiquement (ces dernières en « à valider »). Un devis
        joint met la ligne en <strong>prévisionnel</strong>{" "}
        jusqu&apos;à ce qu&apos;une facture le remplace. Chaque dépense réglée
        par le Sou porte un état <strong>« à payer »</strong> ou{" "}
        <strong>« payée »</strong> (avec le moyen : virement, chèque, carte…).
        Une dépense partagée se répartit à parts égales entre les classes /
        manifestations, ou avec des montants différenciés. La liste s&apos;affiche
        en tableau : cliquez sur un en-tête pour trier, sur une ligne pour la
        dérouler. Import des relevés Crédit Agricole et pointage automatique :
        à venir.
      </p>

      {data?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {data.error}
        </p>
      )}

      {/* Filtres */}
      <div className="space-y-2 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-500">Année</label>
          <select
            value={annee}
            onChange={(e) => setAnnee(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          >
            {(data?.annees || []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {pilule(rubrique === "", () => setRubrique(""), "Toutes rubriques")}
          {Object.entries(RUBRIQUES).map(([k, v]) =>
            pilule(rubrique === k, () => setRubrique(k), v)
          )}
        </div>

        {rubrique === "evenement" && (
          <select
            value={evenementId}
            onChange={(e) => setEvenementId(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="">Tous les événements</option>
            {(data?.evenements || []).map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.nom}
              </option>
            ))}
          </select>
        )}
        {rubrique === "classe" && (
          <select
            value={classe}
            onChange={(e) => setClasse(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="">Toutes les classes</option>
            {CLASSES_REFERENCE.map((c) => (
              <option key={c.cle} value={c.cle}>
                {libelleClasse(c.cle)}
              </option>
            ))}
            {(data?.classesEnPlus || []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        <div className="flex flex-wrap gap-1.5">
          {pilule(sens === "", () => setSens(""), "Dépenses + recettes")}
          {pilule(sens === "depense", () => setSens("depense"), "Dépenses")}
          {pilule(sens === "recette", () => setSens("recette"), "Recettes")}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pilule(statut === "", () => setStatut(""), "Tous statuts")}
          {Object.entries(STATUTS).map(([k, v]) =>
            pilule(statut === k, () => setStatut(k), v.label)
          )}
        </div>
      </div>

      {/* Totaux */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500">Dépenses</p>
          <p className="text-lg font-bold text-red-700">
            {euros(totaux.depense_cents)}
          </p>
          {previsionnel?.depense_cents ? (
            <p className="text-[11px] text-slate-400">
              dont prévisionnel {euros(previsionnel.depense_cents)}
            </p>
          ) : null}
        </div>
        <div className="border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500">Recettes</p>
          <p className="text-lg font-bold text-green-700">
            {euros(totaux.recette_cents)}
          </p>
          {previsionnel?.recette_cents ? (
            <p className="text-[11px] text-slate-400">
              dont prévisionnel {euros(previsionnel.recette_cents)}
            </p>
          ) : null}
        </div>
        <div className="border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500">Solde</p>
          <p
            className={`text-lg font-bold ${
              solde >= 0 ? "text-green-700" : "text-red-700"
            }`}
          >
            {euros(solde)}
          </p>
        </div>
      </div>
      {(aValider || aVerifier || pointe || aPayer?.montant_cents) && (
        <p className="text-xs text-slate-500 mb-4">
          {aPayer?.montant_cents ? (
            <>
              À payer : {euros(aPayer.montant_cents)} ·{" "}
            </>
          ) : null}
          {aValider ? (
            <>
              À valider :{" "}
              {euros(
                (aValider?.depense_cents || 0) + (aValider?.recette_cents || 0)
              )}{" "}
              ·{" "}
            </>
          ) : null}
          À pointer :{" "}
          {euros(
            (aVerifier?.depense_cents || 0) + (aVerifier?.recette_cents || 0)
          )}{" "}
          · Pointé :{" "}
          {euros((pointe?.depense_cents || 0) + (pointe?.recette_cents || 0))}
        </p>
      )}

      <Recap titre="Comptes par classe" entrees={entreesClasses} />
      <Recap titre="Comptes par manifestation" entrees={entreesEvenements} />

      {aRembourser.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">
            À rembourser aux bénévoles
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-slate-200 rounded-lg">
              <tbody>
                {aRembourser.map((v) => (
                  <tr key={v.nom} className="border-t border-slate-100 first:border-t-0">
                    <td className="px-2 py-1">{v.nom}</td>
                    <td className="px-2 py-1 text-right font-semibold text-red-700">
                      {euros(v.montant_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ajout */}
      <div className="mb-4">
        {ajout ? (
          <LigneForm
            accessToken={accessToken}
            annees={data?.annees || []}
            evenements={data?.evenements || []}
            parents={data?.parents || []}
            onDone={() => {
              setAjout(false);
              recharger();
            }}
            onCancel={() => setAjout(false)}
          />
        ) : (
          <button
            onClick={() => setAjout(true)}
            className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full"
          >
            + Ajouter une dépense ou une recette
          </button>
        )}
      </div>

      {/* Liste */}
      {chargement ? (
        <p className="text-slate-500 text-sm">Chargement…</p>
      ) : lignesTriees.length === 0 ? (
        <p className="text-slate-500 text-sm">Aucune ligne pour ces filtres.</p>
      ) : estLarge ? (
        <>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs table-fixed" style={{ minWidth: "640px" }}>
              <colgroup>
                <col style={{ width: "26px" }} />
                <col style={{ width: "92px" }} />
                <col />
                <col style={{ width: "116px" }} />
                <col style={{ width: "92px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "94px" }} />
                <col style={{ width: "104px" }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <th />
                  <EnTeteTri cle="date" tri={tri} setTri={setTri}>
                    Date
                  </EnTeteTri>
                  <EnTeteTri cle="libelle" tri={tri} setTri={setTri} align="left">
                    Libellé
                  </EnTeteTri>
                  <EnTeteTri cle="payeur" tri={tri} setTri={setTri} align="left">
                    Payé par
                  </EnTeteTri>
                  <EnTeteTri cle="facture" tri={tri} setTri={setTri}>
                    Facture
                  </EnTeteTri>
                  <EnTeteTri cle="reglement" tri={tri} setTri={setTri}>
                    Règlement
                  </EnTeteTri>
                  <EnTeteTri cle="statut" tri={tri} setTri={setTri}>
                    Statut
                  </EnTeteTri>
                  <EnTeteTri cle="montant" tri={tri} setTri={setTri} align="right">
                    Montant
                  </EnTeteTri>
                </tr>
              </thead>
              <tbody>
                {lignesTriees.map((l) => (
                  <LigneRow
                    key={l.id}
                    vue="tableau"
                    accessToken={accessToken}
                    ligne={l}
                    evenements={data.evenements || []}
                    annees={data.annees || []}
                    parents={data.parents || []}
                    onChange={recharger}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Cliquez sur un en-tête pour trier, sur une ligne pour la dérouler et agir.
          </p>
        </>
      ) : (
        <div className="space-y-2">
          {lignesTriees.map((l) => (
            <LigneRow
              key={l.id}
              accessToken={accessToken}
              ligne={l}
              evenements={data.evenements || []}
              annees={data.annees || []}
              parents={data.parents || []}
              onChange={recharger}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminComptabilitePage() {
  return (
    <AdminShell title="Comptabilité">
      {(accessToken) => <ComptaAdmin accessToken={accessToken} />}
    </AdminShell>
  );
}
