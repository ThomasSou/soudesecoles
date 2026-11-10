"use client";

// Factures émises par le Sou (partenariats, tables du marché...). Numéros
// attribués automatiquement, continus, sans trou : une facture ne se modifie
// ni ne se supprime, elle s'annule. Un don ne se facture jamais.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AdminShell from "../../admin-shell";
import { telechargerAvecJeton } from "../../../lib/telechargement";

const MOYENS = {
  virement: "Virement",
  cheque: "Chèque",
  cb: "Carte bancaire",
  especes: "Espèces",
  prelevement: "Prélèvement",
  autre: "Autre",
};
const RUBRIQUES = { courant: "Fonctionnement courant", evenement: "Manifestation", investissement: "Investissement" };
const NIVEAU_LIBELLE = { or: "Or", argent: "Argent", bronze: "Bronze" };

function euros(cents) {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}
function dateFr(iso) {
  return iso ? iso.split("-").reverse().join("/") : "";
}
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const champ = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm";

function FormulaireFacture({ accessToken, donnees, partenaireInitial, onDone, onCancel }) {
  const { series, prochains, partenaires, periodes, paiements, evenements } = donnees;
  const [serie, setSerie] = useState(partenaireInitial ? "PA" : series[0]?.code || "PA");
  const [typePiece, setTypePiece] = useState("facture");
  const [dateFacture, setDateFacture] = useState(aujourdhui());
  const [partenaireId, setPartenaireId] = useState(partenaireInitial || "");
  const [periodeId, setPeriodeId] = useState("");
  const [paiementId, setPaiementId] = useState("");
  const [client, setClient] = useState({ raison: "", forme: "", siren: "", adresse: "", cp: "", ville: "" });
  const [objet, setObjet] = useState("");
  const [montant, setMontant] = useState("");
  const [acquitteeLe, setAcquitteeLe] = useState(aujourdhui());
  const [moyen, setMoyen] = useState("virement");
  const [reference, setReference] = useState("");
  const [donOuvert, setDonOuvert] = useState(false);
  const [don, setDon] = useState("");
  const [creerRecette, setCreerRecette] = useState(true);
  const [rubrique, setRubrique] = useState(serie === "MN" ? "evenement" : "courant");
  const [evenementId, setEvenementId] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const partenaire = partenaires.find((p) => p.id === partenaireId) || null;
  const periodesP = useMemo(() => periodes.filter((p) => p.partenaire_id === partenaireId), [periodes, partenaireId]);
  const paiementsP = useMemo(() => paiements.filter((p) => p.partenaire_id === partenaireId), [paiements, partenaireId]);

  // Client prérempli depuis la fiche du partenaire (modifiable).
  useEffect(() => {
    if (!partenaire) return;
    setClient({
      raison: partenaire.raison_sociale || partenaire.nom || "",
      forme: partenaire.forme_juridique || "",
      siren: partenaire.siren || "",
      adresse: partenaire.adresse || "",
      cp: partenaire.code_postal || "",
      ville: partenaire.ville || "",
    });
    setPeriodeId("");
    setPaiementId("");
  }, [partenaire]);

  function choisirPeriode(id) {
    setPeriodeId(id);
    const p = periodes.find((x) => x.id === id);
    if (!p) return;
    if (!objet) {
      setObjet(`Partenariat — Pack ${NIVEAU_LIBELLE[p.niveau] || ""} ${p.debut.slice(0, 4)}`.replace("  ", " "));
    }
    if (!montant && p.montant_annonce_cents) setMontant((p.montant_annonce_cents / 100).toFixed(2));
  }
  function choisirPaiement(id) {
    setPaiementId(id);
    const p = paiements.find((x) => x.id === id);
    if (!p) return;
    setAcquitteeLe(p.recu_le);
    setMoyen(p.moyen in MOYENS ? p.moyen : "autre");
    if (p.reference) setReference(p.reference);
    if (!montant) setMontant((p.montant_cents / 100).toFixed(2));
  }
  function changerSerie(code) {
    setSerie(code);
    setRubrique(code === "MN" ? "evenement" : "courant");
  }

  async function soumettre(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    const res = await fetch("/api/admin/factures", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        serie,
        typePiece,
        dateFacture,
        partenaireId: partenaireId || null,
        periodeId: periodeId || null,
        partenairePaiementId: paiementId || null,
        clientRaisonSociale: client.raison,
        clientForme: client.forme,
        clientSiren: client.siren,
        clientAdresse: client.adresse,
        clientCodePostal: client.cp,
        clientVille: client.ville,
        objet,
        montant,
        acquitteeLe,
        moyenPaiement: moyen,
        paiementReference: reference,
        donAssocie: donOuvert ? don : "",
        creerRecette,
        rubrique,
        evenementId: rubrique === "evenement" ? evenementId : null,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setEnvoi(false);
    if (!res.ok) {
      setErreur(d.error || "Émission impossible.");
      return;
    }
    onDone(d);
  }

  return (
    <form onSubmit={soumettre} className="border border-sou-blue/30 bg-sou-blue/5 rounded-xl p-4 space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-sm">
          Série
          <select value={serie} onChange={(e) => changerSerie(e.target.value)} className={champ}>
            {series.map((s) => (
              <option key={s.code} value={s.code}>{s.code} — {s.libelle}</option>
            ))}
          </select>
          <span className="block text-xs text-slate-500 mt-0.5">
            Prochain numéro : <strong>{prochains[serie]}</strong> (attribué à l&apos;émission)
          </span>
        </label>
        <label className="text-sm">
          Pièce
          <select value={typePiece} onChange={(e) => setTypePiece(e.target.value)} className={champ}>
            <option value="facture">Facture acquittée</option>
            <option value="recu">Reçu</option>
          </select>
        </label>
        <label className="text-sm">
          Date de la facture
          <input type="date" required value={dateFacture} onChange={(e) => setDateFacture(e.target.value)} className={champ} />
        </label>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-sm">
          Partenaire (facultatif)
          <select value={partenaireId} onChange={(e) => setPartenaireId(e.target.value)} className={champ}>
            <option value="">— aucun (vente hors partenariat) —</option>
            {partenaires.map((p) => (
              <option key={p.id} value={p.id}>{p.nom}</option>
            ))}
          </select>
        </label>
        {partenaireId && (
          <>
            <label className="text-sm">
              Période de partenariat
              <select value={periodeId} onChange={(e) => choisirPeriode(e.target.value)} className={champ}>
                <option value="">—</option>
                {periodesP.map((p) => (
                  <option key={p.id} value={p.id}>
                    {dateFr(p.debut)} → {dateFr(p.fin)} {p.niveau ? `(${NIVEAU_LIBELLE[p.niveau] || p.niveau})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Paiement du partenaire concerné
              <select value={paiementId} onChange={(e) => choisirPaiement(e.target.value)} className={champ}>
                <option value="">—</option>
                {paiementsP.map((p) => (
                  <option key={p.id} value={p.id}>
                    {dateFr(p.recu_le)} · {euros(p.montant_cents)} · {MOYENS[p.moyen] || p.moyen}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">Client</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-sm sm:col-span-2">
            Raison sociale
            <input required value={client.raison} onChange={(e) => setClient({ ...client, raison: e.target.value })} className={champ} />
          </label>
          <label className="text-sm">
            Forme juridique
            <input value={client.forme} onChange={(e) => setClient({ ...client, forme: e.target.value })} className={champ} placeholder="SARL, SAS, EI…" />
          </label>
          <label className="text-sm">
            SIREN
            <input value={client.siren} onChange={(e) => setClient({ ...client, siren: e.target.value })} className={champ} inputMode="numeric" placeholder="9 chiffres" />
          </label>
          <label className="text-sm sm:col-span-2">
            Adresse
            <input value={client.adresse} onChange={(e) => setClient({ ...client, adresse: e.target.value })} className={champ} />
          </label>
          <label className="text-sm">
            Code postal
            <input value={client.cp} onChange={(e) => setClient({ ...client, cp: e.target.value })} className={champ} />
          </label>
          <label className="text-sm">
            Ville
            <input value={client.ville} onChange={(e) => setClient({ ...client, ville: e.target.value })} className={champ} />
          </label>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-sm sm:col-span-2">
          Objet
          <input
            required
            value={objet}
            onChange={(e) => setObjet(e.target.value)}
            className={champ}
            placeholder="Partenariat — Pack Argent 2026 / Location d'une table — Marché de Noël"
          />
          <span className="block text-xs text-slate-500 mt-0.5">
            La contrepartie seulement : un don ne se facture pas (reçu fiscal Cerfa).
          </span>
        </label>
        <label className="text-sm">
          Montant (€, sans TVA)
          <input required value={montant} onChange={(e) => setMontant(e.target.value)} className={champ} inputMode="decimal" placeholder="0,00" />
        </label>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-sm">
          Acquittée le
          <input type="date" required value={acquitteeLe} onChange={(e) => setAcquitteeLe(e.target.value)} className={champ} />
        </label>
        <label className="text-sm">
          Par
          <select value={moyen} onChange={(e) => setMoyen(e.target.value)} className={champ}>
            {Object.entries(MOYENS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Référence (n° de chèque, virement) — facultatif
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={champ} />
        </label>
      </div>

      <div className="text-sm space-y-2">
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={donOuvert} onChange={(e) => setDonOuvert(e.target.checked)} className="mt-0.5" />
          <span>
            Le client a versé <strong>en plus</strong>, séparément, un don couvert par un reçu fiscal Cerfa 2041-MEC-SD
            <span className="block text-xs text-slate-500">
              La facture le mentionnera (hors montant) ; le don lui-même n&apos;est jamais facturé.
            </span>
          </span>
        </label>
        {donOuvert && (
          <label className="block max-w-xs">
            Montant du don (€)
            <input value={don} onChange={(e) => setDon(e.target.value)} className={champ} inputMode="decimal" placeholder="0,00" />
          </label>
        )}
      </div>

      <div className="text-sm space-y-2 border-t border-slate-200 pt-3">
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={creerRecette} onChange={(e) => setCreerRecette(e.target.checked)} className="mt-0.5" />
          <span>
            Créer automatiquement la recette correspondante en comptabilité
            <span className="block text-xs text-slate-500">
              À décocher si la recette est déjà saisie : vous pourrez la relier ensuite.
            </span>
          </span>
        </label>
        {creerRecette && (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              Classer la recette dans
              <select value={rubrique} onChange={(e) => setRubrique(e.target.value)} className={champ}>
                {Object.entries(RUBRIQUES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            {rubrique === "evenement" && (
              <label className="text-sm">
                Manifestation
                <select required value={evenementId} onChange={(e) => setEvenementId(e.target.value)} className={champ}>
                  <option value="">—</option>
                  {evenements.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.nom}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </div>

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={envoi} className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50">
          Émettre la facture
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 px-3">Annuler</button>
      </div>
    </form>
  );
}

function LigneFacture({ accessToken, facture, donnees, onChange }) {
  const [ouvert, setOuvert] = useState(false);
  const [recetteId, setRecetteId] = useState("");
  const [rubrique, setRubrique] = useState("courant");
  const [evenementId, setEvenementId] = useState("");
  const [occupe, setOccupe] = useState(false);
  const annulee = facture.statut === "annulee";

  async function action(corps, confirmation) {
    if (confirmation && !confirm(confirmation)) return;
    setOccupe(true);
    const res = await fetch(`/api/admin/factures/${facture.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(corps),
    });
    const d = await res.json().catch(() => ({}));
    setOccupe(false);
    if (!res.ok) alert(d.error || "Action impossible.");
    else onChange();
  }
  async function pdf() {
    try {
      await telechargerAvecJeton(`/api/admin/factures/${facture.id}/pdf`, accessToken, `${facture.numero_complet}.pdf`);
    } catch (e) {
      alert(e.message);
    }
  }
  const periodesP = donnees.periodes.filter((p) => p.partenaire_id === facture.partenaire_id);

  return (
    <div className={`border rounded-xl p-4 ${annulee ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-800">
            {facture.numero_complet}
            {facture.type_piece === "recu" && <span className="ml-2 text-xs font-normal text-slate-500">reçu</span>}
            {annulee && <span className="ml-2 text-xs font-semibold text-red-600">ANNULÉE</span>}
          </p>
          <p className="text-sm text-slate-600">
            {facture.client_raison_sociale}
            {facture.partenaireNom && facture.partenaireNom !== facture.client_raison_sociale ? ` (${facture.partenaireNom})` : ""}
            {" · "}{facture.objet}
          </p>
          <p className="text-xs text-slate-400">
            Émise le {dateFr(facture.date_facture)} · acquittée le {dateFr(facture.acquittee_le)} par {(MOYENS[facture.moyen_paiement] || facture.moyen_paiement).toLowerCase()}
            {facture.paiement_reference ? ` (${facture.paiement_reference})` : ""}
            {facture.don_associe_cents ? ` · don séparé mentionné : ${euros(facture.don_associe_cents)}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-sou-blue">{euros(facture.montant_cents)}</p>
          <button onClick={pdf} className="text-xs text-sou-blue underline">Télécharger le PDF</button>
        </div>
      </div>

      {!annulee && (
        <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-2">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-500">Recette en compta :</span>
            {facture.recette_ligne_id ? (
              <Link href="/admin/comptabilite" className="text-green-700 font-semibold underline">liée ✓ (voir la comptabilité)</Link>
            ) : (
              <>
                <span className="text-amber-700 font-semibold">non liée</span>
                <button onClick={() => setOuvert((v) => !v)} className="text-sou-blue underline">
                  {ouvert ? "fermer" : "créer ou relier"}
                </button>
              </>
            )}
          </p>
          {ouvert && !facture.recette_ligne_id && (
            <div className="flex flex-wrap items-end gap-3 bg-slate-50 rounded-lg p-3">
              <div className="flex flex-wrap items-end gap-2">
                <label>
                  Créer une recette :
                  <select value={rubrique} onChange={(e) => setRubrique(e.target.value)} className="ml-1 border border-slate-300 rounded px-1 py-0.5">
                    {Object.entries(RUBRIQUES).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                {rubrique === "evenement" && (
                  <select value={evenementId} onChange={(e) => setEvenementId(e.target.value)} className="border border-slate-300 rounded px-1 py-0.5">
                    <option value="">manifestation…</option>
                    {donnees.evenements.map((ev) => (
                      <option key={ev.id} value={ev.id}>{ev.nom}</option>
                    ))}
                  </select>
                )}
                <button disabled={occupe} onClick={() => action({ action: "creer_recette", rubrique, evenementId })} className="font-semibold text-sou-blue border border-sou-blue/40 rounded-full px-2 py-0.5 disabled:opacity-40">
                  Créer
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label>
                  ou relier à une recette existante :
                  <select value={recetteId} onChange={(e) => setRecetteId(e.target.value)} className="ml-1 border border-slate-300 rounded px-1 py-0.5 max-w-[22rem]">
                    <option value="">choisir…</option>
                    {donnees.recettesLibres.map((r) => (
                      <option key={r.id} value={r.id}>
                        {dateFr(r.date_operation) || "sans date"} · {euros(r.montant_cents)} · {r.libelle}
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={occupe || !recetteId} onClick={() => action({ action: "lier_recette", ligneId: recetteId })} className="font-semibold text-sou-blue border border-sou-blue/40 rounded-full px-2 py-0.5 disabled:opacity-40">
                  Relier
                </button>
              </div>
            </div>
          )}

          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-500">Partenaire :</span>
            <select
              value={facture.partenaire_id || ""}
              disabled={occupe}
              onChange={(e) => action({ action: "rattacher", partenaireId: e.target.value || null })}
              className="border border-slate-300 rounded px-1 py-0.5"
            >
              <option value="">— non rattachée —</option>
              {donnees.partenaires.map((p) => (
                <option key={p.id} value={p.id}>{p.nom}</option>
              ))}
            </select>
            {facture.partenaire_id && (
              <>
                <span className="font-semibold text-slate-500">Période :</span>
                <select
                  value={facture.periode_id || ""}
                  disabled={occupe}
                  onChange={(e) => action({ action: "rattacher", partenaireId: facture.partenaire_id, periodeId: e.target.value || null, partenairePaiementId: facture.partenaire_paiement_id })}
                  className="border border-slate-300 rounded px-1 py-0.5"
                >
                  <option value="">—</option>
                  {periodesP.map((p) => (
                    <option key={p.id} value={p.id}>{dateFr(p.debut)} → {dateFr(p.fin)}</option>
                  ))}
                </select>
              </>
            )}
          </p>

          <button
            disabled={occupe}
            onClick={() => action({ action: "annuler" }, `Annuler la facture ${facture.numero_complet} ? Son numéro est conservé (marqué « annulée ») et la recette liée sera retirée de la comptabilité.`)}
            className="text-slate-400 hover:text-red-600 underline disabled:opacity-40"
          >
            annuler cette facture
          </button>
        </div>
      )}
    </div>
  );
}

function Liste({ accessToken }) {
  const recherche = useSearchParams();
  const partenaireInitial = recherche.get("partenaire") || "";
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState("");
  const [formOuvert, setFormOuvert] = useState(Boolean(partenaireInitial));
  const [message, setMessage] = useState("");

  const charger = useCallback(() => {
    return fetch("/api/admin/factures", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((d) => (d.error ? setErreur(d.error) : setDonnees(d)))
      .catch(() => setErreur("Chargement impossible."));
  }, [accessToken]);
  useEffect(() => { charger(); }, [charger]);

  return (
    <div>
      <Link href="/admin/comptabilite" className="text-sm text-sou-blue hover:underline">← Comptabilité</Link>
      <h1 className="text-2xl font-bold text-sou-blue mt-3 mb-1">Factures émises par le Sou</h1>
      <p className="text-slate-500 text-sm mb-4">
        Partenariats et ventes avec contrepartie (tables, emplacements). Numérotation continue, association non assujettie à la TVA.
        Une facture ne se modifie pas : en cas d&apos;erreur, on l&apos;annule (son numéro reste) puis on en émet une autre.
      </p>

      {erreur && <p className="text-sm text-red-600 mb-3">{erreur}</p>}
      {message && <p className="text-sm text-green-700 mb-3">{message}</p>}

      {donnees && (
        <>
          {!formOuvert ? (
            <button onClick={() => { setFormOuvert(true); setMessage(""); }} className="bg-sou-blue text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-sou-gold transition-colors mb-5">
              + Émettre une facture
            </button>
          ) : (
            <div className="mb-5">
              <FormulaireFacture
                accessToken={accessToken}
                donnees={donnees}
                partenaireInitial={partenaireInitial}
                onCancel={() => setFormOuvert(false)}
                onDone={(d) => {
                  setFormOuvert(false);
                  setMessage(
                    `Facture ${d.facture.numero_complet} émise.` +
                      (d.recetteErreur ? ` Attention : la recette n'a pas pu être créée (${d.recetteErreur}).` : "")
                  );
                  charger();
                }}
              />
            </div>
          )}

          <div className="space-y-3">
            {donnees.factures.length === 0 && <p className="text-sm text-slate-500">Aucune facture pour le moment.</p>}
            {donnees.factures.map((f) => (
              <LigneFacture key={f.id} accessToken={accessToken} facture={f} donnees={donnees} onChange={charger} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function FacturesEmisesPage() {
  return (
    <AdminShell title="Factures émises">
      {(accessToken) => (
        <Suspense fallback={<p className="text-slate-500 text-sm">Chargement...</p>}>
          <Liste accessToken={accessToken} />
        </Suspense>
      )}
    </AdminShell>
  );
}
