"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminShell from "../admin-shell";
import { trouverDoublons, sansAccents } from "../../lib/stockDictee";

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR") : "");
const fmtNb = (n) => (Number.isInteger(Number(n)) ? String(n) : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

async function appeler(token, methode, corps) {
  const res = await fetch("/api/admin/stock", {
    method: methode,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
  return data;
}

// Création d'article : si un article proche existe, on prévient avant de créer un doublon.
async function creerSansDoublon(token, corps) {
  try { return await appeler(token, "POST", corps); } catch (e) {
    if (/article proche existe/.test(e.message) && window.confirm(`${e.message}\n\nCréer quand même un nouvel article ?`)) return appeler(token, "POST", { ...corps, forcer: true });
    throw e;
  }
}

// Bouton micro (dictée du navigateur) : facultatif, le clavier du téléphone dicte aussi.
function BoutonMicro({ onTexte }) {
  const rec = useRef(null);
  const [ecoute, setEcoute] = useState(false);
  const dispo = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!dispo) return null;
  function basculer() {
    if (ecoute) { rec.current?.stop(); return; }
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new R();
    r.lang = "fr-FR"; r.continuous = true; r.interimResults = false;
    r.onresult = (e) => onTexte(Array.from(e.results).slice(e.resultIndex).map((x) => x[0].transcript).join(" "));
    r.onend = () => setEcoute(false);
    r.onerror = () => setEcoute(false);
    rec.current = r; r.start(); setEcoute(true);
  }
  return (
    <button type="button" onClick={basculer} className={`px-3 py-2 rounded-lg text-sm font-semibold ${ecoute ? "bg-red-600 text-white" : "bg-slate-200 text-slate-700"}`}>
      {ecoute ? "■ Arrêter" : "🎤 Dicter"}
    </button>
  );
}

// Saisie dictée d'un inventaire ou d'achats : texte -> propositions à vérifier -> enregistrement.
function Saisie({ token, articles, evenements, mode, manifestation, onFait }) {
  const [texte, setTexte] = useState("");
  const [date, setDate] = useState(aujourdhui());
  const [libelle, setLibelle] = useState("");
  const [fournisseur, setFournisseur] = useState("");
  const [lignes, setLignes] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const inventaire = mode === "inventaire";

  async function analyser() {
    setErreur(""); setOccupe(true);
    try {
      const { lignes: l } = await appeler(token, "POST", { action: "analyser", texte });
      setLignes(l.map((x) => ({ ...x, choix: x.articleId || "" })));
      if (!l.length) setErreur("Je n'ai rien compris dans ce texte. Écrivez une ligne par article, par exemple : « douze packs de coca zéro ».");
    } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  }
  const maj = (i, ch) => setLignes((ls) => ls.map((l, k) => (k === i ? { ...l, ...ch } : l)));

  async function creerArticle(i) {
    const nom = window.prompt("Nom du nouvel article :", lignes[i].libelle);
    if (!nom) return;
    try {
      const { article } = await creerSansDoublon(token, { action: "article", nom, unite: lignes[i].unite || "unité" });
      maj(i, { choix: article.id, nouveaux: [...(lignes[i].nouveaux || []), article] });
      onFait(false);
    } catch (e) { setErreur(e.message); }
  }

  async function enregistrer() {
    setErreur(""); setOccupe(true);
    try {
      const valides = lignes.filter((l) => l.choix && l.quantite != null);
      const corps = {
        action: inventaire ? "inventaire" : mode === "besoins" ? "besoins" : "achats", manifestation, date, libelle, fournisseur,
        lignes: valides.map((l) => ({ articleId: l.choix, quantite: l.quantite, prix: l.prix, datePeremption: l.datePeremption, libelle: l.libelle })),
      };
      await appeler(token, "POST", corps);
      setTexte(""); setLignes(null);
      onFait(true);
    } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  }

  const aCompleter = lignes ? lignes.filter((l) => !l.choix || l.quantite == null).length : 0;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {mode === "besoins"
          ? "Dictez ce dont la manifestation a besoin, une ligne par article (ex. « trois cents gobelets, quarante packs de coca zéro »). Ce que vous dictez remplace le besoin déjà noté pour ces articles."
          : inventaire
          ? "Comptez ce qu'il reste au local et dictez-le, une ligne par article (ex. « quarante canettes de coca zéro périmées mars 2027 »)."
          : "Dictez ce qui vient d'être acheté (ex. « douze packs de coca zéro, trois cartons de gobelets »)."}
      </p>
      <div className={`flex flex-wrap gap-2 ${mode === "besoins" ? "hidden" : ""}`}>
        <label className="text-sm">Date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-2 py-1 ml-1" /></label>
        {inventaire ? (
          <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Libellé (ex. Après le Marché de Noël)" list="evts" className="border rounded px-2 py-1 flex-1 min-w-[12rem]" />
        ) : (
          <input value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} placeholder="Magasin (facultatif)" className="border rounded px-2 py-1 flex-1 min-w-[12rem]" />
        )}
        <datalist id="evts">{evenements.map((e) => <option key={e} value={e} />)}</datalist>
      </div>
      <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={7} placeholder="Une ligne par article…" className="w-full border rounded-lg p-3 text-base" />
      <div className="flex gap-2 items-center">
        <BoutonMicro onTexte={(t) => setTexte((x) => (x ? x.trimEnd() + "\n" : "") + t)} />
        <button type="button" onClick={analyser} disabled={occupe || !texte.trim()} className="px-4 py-2 rounded-lg bg-sou-blue text-white font-semibold disabled:opacity-50">Analyser</button>
      </div>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      {lignes && lignes.length > 0 && (
        <div className="border rounded-lg divide-y bg-white">
          {lignes.map((l, i) => (
            <div key={i} className={`p-2 flex flex-wrap gap-2 items-center ${!l.choix || l.quantite == null ? "bg-amber-50" : ""}`}>
              <input type="number" step="any" value={l.quantite ?? ""} onChange={(e) => maj(i, { quantite: e.target.value === "" ? null : Number(e.target.value) })} className="w-20 border rounded px-2 py-1" />
              <select value={l.choix} onChange={(e) => maj(i, { choix: e.target.value })} className="border rounded px-2 py-1 flex-1 min-w-[12rem]">
                <option value="">— choisir l&apos;article —</option>
                {[...articles, ...(lignes[i].nouveaux || [])].filter((a) => a.actif !== false).map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
              {!l.choix && <button type="button" onClick={() => creerArticle(i)} className="text-sm text-sou-blue underline">+ nouvel article</button>}
              {mode === "achats" && <input type="number" step="any" min="0" value={l.prix ?? ""} onChange={(e) => maj(i, { prix: e.target.value })} placeholder="Prix unitaire €" className="w-32 border rounded px-2 py-1" />}
              {inventaire && <input type="date" value={l.datePeremption || ""} onChange={(e) => maj(i, { datePeremption: e.target.value || null })} title="Date de péremption" className="border rounded px-2 py-1" />}
              <span className="text-xs text-slate-500 basis-full">« {l.brut} »{l.sur ? " · reconnu" : l.candidats?.length ? " · à confirmer" : " · inconnu"}</span>
              <button type="button" onClick={() => setLignes((ls) => ls.filter((_, k) => k !== i))} className="text-xs text-red-600">retirer</button>
            </div>
          ))}
        </div>
      )}
      {lignes && lignes.length > 0 && (
        <button type="button" onClick={enregistrer} disabled={occupe || aCompleter === lignes.length} className="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold disabled:opacity-50">
          Enregistrer {aCompleter ? `(${aCompleter} ligne(s) à compléter seront ignorées)` : ""}
        </button>
      )}
    </div>
  );
}

// Colle ici le tableau Excel (copier-coller des cellules) : Nom, Quantité, Péremption, Catégorie, Unité.
function ImportExcel({ token, onFait }) {
  const [depart, setDepart] = useState("");
  async function importerDepart() {
    if (!window.confirm("Charger l'inventaire de départ préparé à partir de votre tableau (articles, fournisseurs, quantités connues, matériel) ?")) return;
    try { const r = await appeler(token, "POST", { action: "importer_depart", date: aujourdhui() }); setDepart(`Fait : ${r.articles} articles, ${r.lignes} quantités reprises.`); onFait(true); } catch (e) { setDepart(e.message); }
  }
  const [texte, setTexte] = useState("");
  const [date, setDate] = useState(aujourdhui());
  const [msg, setMsg] = useState("");
  function lire() {
    const rows = texte.split(/\r?\n/).map((r) => r.split(/\t|;/).map((c) => c.trim())).filter((r) => r.some(Boolean));
    if (!rows.length) return [];
    const cle = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const ent = rows[0].map(cle);
    const avecEntete = ent.some((c) => /^(nom|article|produit|designation)/.test(c));
    const idx = (re, def) => { const k = ent.findIndex((c) => re.test(c)); return avecEntete ? k : def; };
    const iNom = idx(/^(nom|article|produit|designation)/, 0), iQte = idx(/^(qte|quantite|stock)/, 1), iPer = idx(/(peremption|dlc|dluo|date)/, 2), iCat = idx(/^(categorie|famille|type)/, 3), iUni = idx(/^(unite)/, 4), iFou = idx(/^(fournisseur|magasin)/, -1);
    const date_ = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s || ""); if (m) return `${m[3].length === 2 ? 2000 + +m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; return /^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : null; };
    return (avecEntete ? rows.slice(1) : rows).map((r) => ({
      nom: iNom >= 0 ? r[iNom] : "", quantite: iQte >= 0 ? Number((r[iQte] || "").replace(",", ".")) : NaN,
      datePeremption: iPer >= 0 ? date_(r[iPer]) : null, categorie: iCat >= 0 ? r[iCat] : "", unite: iUni >= 0 ? r[iUni] : "", fournisseur: iFou >= 0 ? r[iFou] : "",
    })).filter((l) => l.nom && Number.isFinite(l.quantite));
  }
  async function envoyer() {
    setMsg("");
    const lignes = lire();
    if (!lignes.length) { setMsg("Aucune ligne lisible : il faut au moins une colonne nom et une colonne quantité."); return; }
    try {
      const r = await appeler(token, "POST", { action: "importer", date, lignes });
      setMsg(`Import fait : ${r.lignes} ligne(s), ${r.articles} article(s).`); setTexte(""); onFait(true);
    } catch (e) { setMsg(e.message); }
  }
  return (
    <div className="space-y-3">
      <div className="border rounded-lg p-3 bg-sky-50 space-y-2">
        <p className="text-sm">Votre tableau « STOCK Marché de Noël 2026 » (feuilles Stock et Matériel) est déjà préparé : un clic le charge, sans copier-coller. À faire une seule fois.</p>
        <button type="button" onClick={importerDepart} className="px-4 py-2 rounded-lg bg-sou-blue text-white font-semibold">Charger l&apos;inventaire de départ</button>
        {depart && <p className="text-sm">{depart}</p>}
      </div>
      <p className="text-sm text-slate-600">Sinon, sélectionnez les cellules de votre tableau Excel (avec la ligne de titres si possible), copiez, collez ci-dessous. Colonnes reconnues (grâce à la ligne de titres) : Nom, Quantité, Péremption, Catégorie, Unité, Fournisseur. Les prix de l'ancien fichier ne sont pas repris : ils viendront des factures. Cela crée l&apos;inventaire de départ.</p>
      <label className="text-sm">Date de ce comptage <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-2 py-1 ml-1" /></label>
      <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={10} className="w-full border rounded-lg p-3 font-mono text-sm" />
      <p className="text-xs text-slate-500">{texte.trim() ? `${lire().length} ligne(s) lisible(s)` : ""}</p>
      <button type="button" onClick={envoyer} disabled={!texte.trim()} className="px-4 py-2 rounded-lg bg-sou-blue text-white font-semibold disabled:opacity-50">Importer</button>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}


// Stock estimé : recherche, filtre par catégorie, tri par colonne.
function StockActuel({ d, nom }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [tri, setTri] = useState({ cle: "categorie", sens: 1 });
  const [tous, setTous] = useState(false);
  if (d.estime.length === 0) return <p className="text-slate-600">Aucun inventaire pour l&apos;instant : commencez par « Import Excel » ou « Faire un inventaire ».</p>;
  const estime = Object.fromEntries(d.estime.map((e) => [e.article_id, e]));
  const limite = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
  let rows = d.articles.filter((a) => a.actif !== false).map((a) => ({ a, quantite: estime[a.id]?.quantite ?? null, peremption: estime[a.id]?.peremption || null, prix: d.dernierPrix[a.id] ?? null }));
  if (!tous) rows = rows.filter((r) => r.quantite != null);
  const cats = [...new Set(d.articles.map((a) => a.categorie).filter(Boolean))].sort();
  if (cat) rows = rows.filter((r) => r.a.categorie === cat);
  const mots = sansAccents(q).split(/\s+/).filter(Boolean);
  if (mots.length) rows = rows.filter((r) => { const t = sansAccents(`${r.a.nom} ${(r.a.alias || []).join(" ")} ${r.a.categorie || ""} ${r.a.fournisseur || ""}`); return mots.every((m) => t.includes(m)); });
  const val = (r) => ({ nom: r.a.nom, categorie: r.a.categorie || "", quantite: r.quantite ?? -1, peremption: r.peremption || "9999", fournisseur: r.a.fournisseur || "", prix: r.prix ?? -1 }[tri.cle]);
  rows.sort((x, y) => { const u = val(x), v = val(y); return (typeof u === "number" ? u - v : String(u).localeCompare(String(v), "fr")) * tri.sens || x.a.nom.localeCompare(y.a.nom, "fr"); });
  const Th = ({ cle, children, droite }) => (
    <th className={`p-2 cursor-pointer select-none ${droite ? "text-right" : ""}`} onClick={() => setTri((t) => ({ cle, sens: t.cle === cle ? -t.sens : 1 }))}>
      {children}{tri.cle === cle ? (tri.sens > 0 ? " ▲" : " ▼") : ""}
    </th>
  );
  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher : canettes, couverts, gobelets…" className="border rounded-lg px-3 py-2 flex-1 min-w-[14rem]" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="border rounded-lg px-2 py-2"><option value="">Toutes les catégories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
        <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={tous} onChange={(e) => setTous(e.target.checked)} /> aussi les articles pas encore comptés</label>
      </div>
      <p className="text-sm text-slate-500 mb-2">{rows.length} article(s). Estimation = dernier inventaire ({fmtDate(d.inventaires.find((i) => i.id === d.dernierInventaire)?.date_inventaire)}) + achats notés depuis. Cliquez sur un titre de colonne pour trier.</p>
      <table className="w-full text-sm bg-white border rounded-lg">
        <thead><tr className="text-left bg-slate-100"><Th cle="nom">Article</Th><Th cle="categorie">Catégorie</Th><Th cle="quantite" droite>Quantité</Th><Th cle="peremption">Péremption la + proche</Th><Th cle="fournisseur">Fournisseur</Th><Th cle="prix" droite>Dernier prix</Th></tr></thead>
        <tbody>
          {rows.map(({ a, quantite, peremption, prix }) => {
            const bas = quantite != null && a.seuil_alerte != null && quantite <= a.seuil_alerte;
            const proche = peremption && peremption <= limite;
            return (
              <tr key={a.id} className="border-t">
                <td className="p-2">{a.nom}</td><td className="p-2 text-slate-500">{a.categorie}</td>
                <td className={`p-2 text-right font-semibold ${bas ? "text-red-600" : ""}`}>{quantite != null ? <>{fmtNb(quantite)} <span className="font-normal text-slate-500">{a.unite}</span>{bas ? " ⚠" : ""}</> : <span className="font-normal text-slate-400">non compté</span>}</td>
                <td className={`p-2 ${proche ? "text-red-600 font-semibold" : ""}`}>{peremption ? fmtDate(peremption) : <span className="text-slate-400">—</span>}</td>
                <td className="p-2 text-slate-500">{a.fournisseur}</td>
                <td className="p-2 text-right">{prix != null ? `${fmtNb(prix)} €` : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Besoins d'une manifestation -> liste de courses (besoin − stock estimé), classée par fournisseur.
function Courses({ token, d, nom, onChange }) {
  const manifs = [...new Set(d.besoins.map((b) => b.manifestation))];
  const [manif, setManif] = useState(manifs[0] || "Marché de Noël 2026");
  const [dicter, setDicter] = useState(false);
  const [ajout, setAjout] = useState("");
  const [msg, setMsg] = useState("");
  const estime = Object.fromEntries(d.estime.map((e) => [e.article_id, e.quantite]));
  const lignes = d.besoins.filter((b) => b.manifestation === manif && nom[b.article_id]);
  const calc = lignes.map((b) => ({ ...b, art: nom[b.article_id], stock: estime[b.article_id] || 0, acheter: Math.max(0, Number(b.quantite) - (estime[b.article_id] || 0)) }));
  const parFournisseur = {};
  for (const l of calc) if (l.acheter > 0) (parFournisseur[l.art.fournisseur || "Fournisseur à préciser"] ||= []).push(l);

  async function fixer(articleId, quantite) {
    setMsg("");
    try { await appeler(token, "POST", { action: "besoins", manifestation: manif, lignes: [{ articleId, quantite }] }); onChange(); } catch (e) { setMsg(e.message); }
  }
  async function toutAchete() {
    if (!window.confirm("Noter tout ce qui est à acheter comme acheté aujourd'hui ? (le stock estimé augmentera d'autant)")) return;
    const lignesA = calc.filter((l) => l.acheter > 0).map((l) => ({ articleId: l.article_id, quantite: l.acheter }));
    try { await appeler(token, "POST", { action: "achats", date: aujourdhui(), note: `Courses ${manif}`, lignes: lignesA }); onChange(); } catch (e) { setMsg(e.message); }
  }
  if (!d.besoinsDispo) return <p className="text-amber-700">Cet écran attend la migration 0064 (besoins par manifestation).</p>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 items-center print:hidden">
        <label className="text-sm">Manifestation <input list="manifs" value={manif} onChange={(e) => setManif(e.target.value)} className="border rounded px-2 py-1 ml-1 w-64" /></label>
        <datalist id="manifs">{manifs.map((m) => <option key={m} value={m} />)}</datalist>
        <button onClick={() => setDicter(!dicter)} className="px-3 py-1.5 rounded bg-slate-200 text-sm font-semibold">{dicter ? "Fermer la dictée" : "Dicter les besoins"}</button>
        <select value={ajout} onChange={(e) => { setAjout(""); if (e.target.value) fixer(e.target.value, 0); }} className="border rounded px-2 py-1 text-sm">
          <option value="">+ ajouter un article…</option>
          {d.articles.filter((a) => a.actif !== false && !a.durable).map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
        </select>
        <button onClick={() => window.print()} className="px-3 py-1.5 rounded bg-slate-200 text-sm font-semibold">Imprimer</button>
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {dicter && <Saisie token={token} articles={d.articles.filter((a) => !a.durable)} evenements={[]} mode="besoins" manifestation={manif} onFait={() => { onChange(); setDicter(false); }} />}

      <div>
        <h2 className="font-bold text-sou-blue mb-2">Besoins de « {manif} »</h2>
        {calc.length === 0 ? <p className="text-slate-600 text-sm">Aucun besoin noté. Dictez-les ou ajoutez des articles.</p> : (
          <table className="w-full text-sm bg-white border rounded-lg">
            <thead><tr className="text-left bg-slate-100"><th className="p-2">Article</th><th className="p-2 text-right">Besoin</th><th className="p-2 text-right">En stock</th><th className="p-2 text-right">À acheter</th><th className="p-2">Fournisseur</th><th className="print:hidden" /></tr></thead>
            <tbody>
              {calc.sort((a, b) => a.art.nom.localeCompare(b.art.nom)).map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2">{l.art.nom}</td>
                  <td className="p-2 text-right"><input type="number" step="any" min="0" defaultValue={l.quantite} onBlur={(e) => e.target.value !== String(l.quantite) && fixer(l.article_id, Number(e.target.value))} className="w-20 border rounded px-1 text-right" /></td>
                  <td className="p-2 text-right">{fmtNb(l.stock)}</td>
                  <td className={`p-2 text-right font-semibold ${l.acheter > 0 ? "text-red-600" : "text-green-700"}`}>{l.acheter > 0 ? fmtNb(l.acheter) : "rien"}</td>
                  <td className="p-2 text-slate-500">{l.art.fournisseur}</td>
                  <td className="p-2 print:hidden"><button className="text-xs text-red-600" onClick={async () => { await appeler(token, "POST", { action: "supprimer_besoin", id: l.id }); onChange(); }}>retirer</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {Object.keys(parFournisseur).length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-2"><h2 className="font-bold text-sou-blue">Liste de courses</h2>
            <button onClick={toutAchete} className="print:hidden text-sm px-3 py-1 rounded bg-green-600 text-white font-semibold">Tout est acheté → noter les achats</button></div>
          {Object.entries(parFournisseur).sort().map(([f, ls]) => (
            <div key={f} className="mb-3 bg-white border rounded-lg">
              <div className="px-3 py-1.5 bg-slate-100 font-semibold">{f}</div>
              <ul className="divide-y text-sm">{ls.map((l) => <li key={l.id} className="px-3 py-1.5 flex justify-between"><span>☐ {l.art.nom}</span><span className="font-semibold">{fmtNb(l.acheter)} {l.art.unite}</span></li>)}</ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Contenu({ token }) {
  const [d, setD] = useState(null);
  const [vue, setVue] = useState("stock");
  const [erreur, setErreur] = useState("");
  const charger = useCallback(async () => {
    try { setD(await appeler(token, "GET")); } catch (e) { setErreur(e.message); }
  }, [token]);
  useEffect(() => { charger(); }, [charger]);

  if (erreur) return <p className="text-red-600">{erreur}</p>;
  if (!d) return <p className="text-slate-500">Chargement…</p>;
  const nom = Object.fromEntries(d.articles.map((a) => [a.id, a]));
  const apresFait = (retour) => { charger(); if (retour) setVue("stock"); };
  const onglets = [["stock", "Stock actuel"], ["inventaire", "Faire un inventaire"], ["courses", "Liste de courses"], ["achats", "Noter des achats"], ["conso", "Consommation"], ["articles", "Articles"], ["import", "Import Excel"]];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5 print:hidden">
        {onglets.map(([k, l]) => <button key={k} onClick={() => setVue(k)} className={`px-3 py-1.5 rounded-full text-sm font-semibold ${vue === k ? "bg-sou-blue text-white" : "bg-slate-200 text-slate-700"}`}>{l}</button>)}
      </div>

      {vue === "stock" && <StockActuel d={d} nom={nom} />}

      {vue === "courses" && <Courses token={token} d={d} nom={nom} onChange={charger} />}
      {vue === "inventaire" && <Saisie token={token} articles={d.articles} evenements={d.inventaires.map((i) => i.libelle).filter(Boolean)} mode="inventaire" onFait={apresFait} />}
      {vue === "achats" && (
        <div className="space-y-6">
          <Saisie token={token} articles={d.articles} evenements={[]} mode="achats" onFait={apresFait} />
          <div>
            <h2 className="font-bold text-sou-blue mb-2">Derniers achats notés</h2>
            <ul className="text-sm divide-y bg-white border rounded-lg">
              {d.achats.slice(0, 30).map((a) => (
                <li key={a.id} className="p-2 flex justify-between gap-2">
                  <span>{fmtDate(a.date_achat)} · {fmtNb(a.quantite)} × {nom[a.article_id]?.nom} {a.fournisseur ? `(${a.fournisseur})` : ""}</span>
                  <button className="text-red-600 text-xs" onClick={async () => { if (window.confirm("Supprimer cet achat ?")) { await appeler(token, "POST", { action: "supprimer_achat", id: a.id }); charger(); } }}>supprimer</button>
                </li>
              ))}
              {d.achats.length === 0 && <li className="p-2 text-slate-500">Aucun achat noté.</li>}
            </ul>
          </div>
        </div>
      )}

      {vue === "conso" && (
        <div className="space-y-6">
          {d.inventaires.length < 2 && <p className="text-slate-600">La consommation se calcule entre deux inventaires. Il en faut au moins deux (le premier est la base de départ).</p>}
          {d.inventaires.map((inv) => {
            const c = d.conso[inv.id]; if (!c) return null;
            const prec = d.inventaires.find((i) => i.id === c.precedent);
            return (
              <div key={inv.id}>
                <h2 className="font-bold text-sou-blue">{inv.libelle || "Inventaire"} · {fmtDate(inv.date_inventaire)} <span className="text-slate-500 font-normal">(depuis le {fmtDate(prec?.date_inventaire)})</span></h2>
                <table className="w-full text-sm bg-white border rounded-lg mt-2">
                  <thead><tr className="text-left bg-slate-100"><th className="p-2">Article</th><th className="p-2 text-right">Avant</th><th className="p-2 text-right">+ Achats</th><th className="p-2 text-right">Après</th><th className="p-2 text-right">Consommé</th><th className="p-2 text-right">Coût estimé</th></tr></thead>
                  <tbody>
                    {c.lignes.filter((l) => nom[l.articleId]).sort((a, b) => b.consomme - a.consomme).map((l) => (
                      <tr key={l.articleId} className="border-t"><td className="p-2">{nom[l.articleId].nom}</td><td className="p-2 text-right">{fmtNb(l.avant)}</td><td className="p-2 text-right">{fmtNb(l.achats)}</td><td className="p-2 text-right">{fmtNb(l.apres)}</td>
                        <td className={`p-2 text-right font-semibold ${l.consomme < 0 ? "text-amber-600" : ""}`} title={l.consomme < 0 ? "Négatif : un achat ou un comptage manque probablement" : ""}>{fmtNb(l.consomme)}</td><td className="p-2 text-right text-slate-600">{d.dernierPrix[l.articleId] != null && l.consomme > 0 ? `${(l.consomme * d.dernierPrix[l.articleId]).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €` : ""}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          {d.inventaires.length > 0 && (
            <div>
              <h2 className="font-bold text-sou-blue mb-2">Inventaires enregistrés</h2>
              <ul className="text-sm divide-y bg-white border rounded-lg">
                {d.inventaires.map((i) => (
                  <li key={i.id} className="p-2 flex justify-between"><span>{fmtDate(i.date_inventaire)} · {i.libelle || "Inventaire"} · {i.lignes.length} ligne(s)</span>
                    <button className="text-red-600 text-xs" onClick={async () => { if (window.confirm("Supprimer cet inventaire ?")) { await appeler(token, "POST", { action: "supprimer_inventaire", id: i.id }); charger(); } }}>supprimer</button></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {vue === "articles" && <Articles token={token} articles={d.articles} onChange={charger} />}
      {vue === "import" && <ImportExcel token={token} onFait={apresFait} />}
    </div>
  );
}

// Articles qui semblent dire la même chose : on propose de les fusionner (l'historique est conservé).
function Doublons({ token, articles, onChange }) {
  const [ouvert, setOuvert] = useState(false);
  const [msg, setMsg] = useState("");
  const paires = ouvert ? trouverDoublons(articles.filter((a) => a.actif !== false)) : [];
  async function fusionner(garde, retire) {
    if (!window.confirm(`Fusionner « ${retire.nom} » dans « ${garde.nom} » ? Tout l'historique passe sur « ${garde.nom} ».`)) return;
    try { await appeler(token, "POST", { action: "fusionner", garderId: garde.id, retirerId: retire.id }); onChange(); } catch (e) { setMsg(e.message); }
  }
  async function recat() {
    try { const r = await appeler(token, "POST", { action: "recategoriser_depart" }); setMsg(`${r.modifies} catégorie(s) remises à jour.`); onChange(); } catch (e) { setMsg(e.message); }
  }
  return (
    <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={() => setOuvert(!ouvert)} className="px-3 py-1.5 rounded bg-slate-200 text-sm font-semibold">{ouvert ? "Masquer" : "Chercher les doublons possibles"}</button>
        <button onClick={recat} className="px-3 py-1.5 rounded bg-slate-200 text-sm font-semibold">Corriger les catégories du fichier de départ</button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
      {ouvert && (paires.length === 0 ? <p className="text-sm text-slate-600">Aucun doublon probable.</p> : (
        <ul className="text-sm space-y-1">
          {paires.map(([x, y]) => (
            <li key={x.id + y.id} className="flex flex-wrap gap-2 items-center bg-white border rounded px-2 py-1">
              <span>« {x.nom} » ≈ « {y.nom} »</span>
              <button className="text-sou-blue underline" onClick={() => fusionner(x, y)}>garder le 1er</button>
              <button className="text-sou-blue underline" onClick={() => fusionner(y, x)}>garder le 2e</button>
            </li>
          ))}
          <li className="text-xs text-slate-500">Si ce sont bien deux choses différentes (ex. couvercle et casserole), ignorez la ligne.</li>
        </ul>
      ))}
    </div>
  );
}

function Articles({ token, articles, onChange }) {
  const [nouv, setNouv] = useState({ nom: "", categorie: "", unite: "unité", seuil_alerte: "" });
  const [erreur, setErreur] = useState("");
  async function ajouter(e) {
    e.preventDefault(); setErreur("");
    try { await creerSansDoublon(token, { action: "article", ...nouv }); setNouv({ nom: "", categorie: "", unite: "unité", seuil_alerte: "" }); onChange(); } catch (er) { setErreur(er.message); }
  }
  async function modifier(a, ch) {
    try { await appeler(token, "POST", { action: "article", id: a.id, nom: a.nom, categorie: a.categorie, unite: a.unite, seuil_alerte: a.seuil_alerte, alias: a.alias, actif: a.actif, ...ch }); onChange(); } catch (er) { setErreur(er.message); }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={ajouter} className="flex flex-wrap gap-2 items-end">
        <input required value={nouv.nom} onChange={(e) => setNouv({ ...nouv, nom: e.target.value })} placeholder="Nom de l'article" className="border rounded px-2 py-1 flex-1 min-w-[10rem]" />
        <input value={nouv.categorie} onChange={(e) => setNouv({ ...nouv, categorie: e.target.value })} placeholder="Catégorie (boissons…)" className="border rounded px-2 py-1 w-40" />
        <input value={nouv.unite} onChange={(e) => setNouv({ ...nouv, unite: e.target.value })} placeholder="Unité" className="border rounded px-2 py-1 w-24" />
        <input type="number" value={nouv.seuil_alerte} onChange={(e) => setNouv({ ...nouv, seuil_alerte: e.target.value })} placeholder="Alerte si ≤" className="border rounded px-2 py-1 w-28" />
        <button className="px-3 py-1.5 rounded bg-sou-blue text-white font-semibold">Ajouter</button>
      </form>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <Doublons token={token} articles={articles} onChange={onChange} />
      <table className="w-full text-sm bg-white border rounded-lg">
        <thead><tr className="text-left bg-slate-100"><th className="p-2">Article</th><th className="p-2">Catégorie</th><th className="p-2">Unité</th><th className="p-2">Alerte ≤</th><th className="p-2">Appelé aussi…</th><th /></tr></thead>
        <tbody>
          {articles.map((a) => (
            <tr key={a.id} className={`border-t ${a.actif === false ? "opacity-50" : ""}`}>
              <td className="p-2">{a.nom}</td><td className="p-2">{a.categorie}</td><td className="p-2">{a.unite}</td>
              <td className="p-2"><input type="number" defaultValue={a.seuil_alerte ?? ""} onBlur={(e) => modifier(a, { seuil_alerte: e.target.value })} className="w-16 border rounded px-1" /></td>
              <td className="p-2 text-xs text-slate-500">{(a.alias || []).join(", ")}</td>
              <td className="p-2 text-right"><button className="text-xs text-red-600" onClick={async () => { if (window.confirm(`Retirer « ${a.nom} » ?`)) { await appeler(token, "POST", { action: "supprimer_article", id: a.id }); onChange(); } }}>retirer</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminStockPage() {
  return (
    <AdminShell title="Stock">
      {(accessToken) => (
        <div>
          <h1 className="text-2xl font-bold text-sou-blue mb-1">Stock du local</h1>
          <p className="text-slate-500 text-sm mb-5 print:hidden">Inventaire après chaque manifestation, achats entre deux, et calcul de ce qui a été consommé.</p>
          <Contenu token={accessToken} />
        </div>
      )}
    </AdminShell>
  );
}
