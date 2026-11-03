"use client";

// Éditeur de la page publique du partenaire (/partenaires/<slug>), par blocs.
// Le partenaire enregistre un brouillon, puis l'envoie au bureau, qui valide
// avant toute publication. Texte brut uniquement ; pas de vidéo intégrée
// (le site ne pose aucun cookie).

import { useCallback, useEffect, useState } from "react";
import { RenduModules } from "../partenaires/RenduModules";

const MAX_MODULES = 12;
const MAX_GALERIE = 6;
const LIBELLES = { texte: "Texte", photo: "Photo", galerie: "Galerie de photos", infos: "Infos pratiques", bouton: "Bouton lien" };
const NEUF = {
  texte: { type: "texte", titre: "", texte: "" },
  photo: { type: "photo", url: "", legende: "" },
  galerie: { type: "galerie", images: [] },
  infos: { type: "infos", adresse: "", telephone: "", email: "", site: "", horaires: "" },
  bouton: { type: "bouton", libelle: "", url: "" },
};
const STATUTS = {
  aucune: "Pas encore modifiée",
  brouillon: "Brouillon (non envoyé)",
  soumis: "En attente de validation par le bureau",
  refuse: "Refusée — à corriger",
  publie: "Publiée",
};

// Réduit la photo dans le navigateur (≤ 1600 px, JPEG) avant l'envoi : plus
// rapide pour le partenaire, et respecte la limite de 4 Mo.
function reduireImage(fichier) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(fichier);
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image illisible.")); };
    img.src = url;
  });
}

const champ = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm";
const etiquette = "text-xs font-semibold text-slate-500";

export default function EditeurPage({ accessToken }) {
  const [etat, setEtat] = useState(null);
  const [modules, setModules] = useState([]);
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [apercu, setApercu] = useState(false);
  const entetes = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };

  const charger = useCallback(() => {
    fetch("/api/partenaire/page", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setErreur(d.error); return; }
        setEtat(d);
        setModules(d.contenu?.modules || []);
      })
      .catch(() => setErreur("Chargement impossible."));
  }, [accessToken]);
  useEffect(() => { charger(); }, [charger]);

  const verrouille = etat?.statut === "soumis";
  const maj = (i, patch) => { setModules((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m))); setMessage(""); };
  const retirer = (i) => setModules((ms) => ms.filter((_, j) => j !== i));
  const deplacer = (i, d) => setModules((ms) => {
    const j = i + d;
    if (j < 0 || j >= ms.length) return ms;
    const c = [...ms]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });

  async function televerser(fichier) {
    const imageDataUrl = await reduireImage(fichier);
    const res = await fetch("/api/partenaire/page/image", { method: "POST", headers: entetes, body: JSON.stringify({ imageDataUrl }) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Envoi de la photo impossible.");
    return d.url;
  }
  async function choisirPhoto(i, fichier) {
    if (!fichier) return;
    setErreur(""); setOccupe(true);
    try { maj(i, { url: await televerser(fichier) }); } catch (e) { setErreur(e.message); }
    setOccupe(false);
  }
  async function ajouterGalerie(i, fichiers) {
    setErreur(""); setOccupe(true);
    try {
      const actuelles = modules[i].images || [];
      const places = Math.max(0, MAX_GALERIE - actuelles.length);
      const nouvelles = [];
      for (const f of Array.from(fichiers).slice(0, places)) nouvelles.push({ url: await televerser(f), legende: "" });
      maj(i, { images: [...actuelles, ...nouvelles] });
    } catch (e) { setErreur(e.message); }
    setOccupe(false);
  }

  async function enregistrer(soumettre) {
    setErreur(""); setMessage(""); setOccupe(true);
    const res = await fetch("/api/partenaire/page", { method: "PUT", headers: entetes, body: JSON.stringify({ contenu: { modules }, soumettre }) });
    const d = await res.json();
    setOccupe(false);
    if (!res.ok) { setErreur(d.error || "Erreur."); return; }
    setMessage(soumettre ? "Page envoyée au bureau. Elle sera publiée après relecture." : "Brouillon enregistré.");
    charger();
  }

  if (!etat) return <p className="text-sm text-slate-500">{erreur || "Chargement..."}</p>;

  return (
    <div>
      <p className="text-sm text-slate-500 mb-2">
        Composez la page qui vous présente sur le site du Sou, avec des blocs (texte, photos, infos pratiques, lien).
        Rien n&apos;est publié sans validation du bureau.
      </p>
      <p className="text-sm mb-3">
        <span className="font-semibold">État :</span> {STATUTS[etat.statut] || etat.statut}
        {etat.aUnePublication && etat.statut !== "publie" && " (l'ancienne version reste visible en attendant)"}
        {etat.slug && etat.aUnePublication && (
          <> · <a href={`/partenaires/${etat.slug}`} target="_blank" rel="noopener noreferrer" className="text-sou-blue underline">Voir ma page</a></>
        )}
      </p>
      {etat.statut === "refuse" && etat.motifRefus && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          Le bureau a demandé une correction : {etat.motifRefus}
        </p>
      )}
      {erreur && <p className="text-sm text-red-600 mb-3">{erreur}</p>}
      {message && <p className="text-sm text-green-700 mb-3">{message}</p>}

      {apercu ? (
        <div className="border border-dashed border-slate-300 rounded-xl p-5 bg-slate-50 mb-4">
          <RenduModules contenu={{ modules }} />
        </div>
      ) : (
        <div className="space-y-3 mb-4">
          {modules.map((m, i) => (
            <fieldset key={i} disabled={verrouille || occupe} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-sou-blue">{LIBELLES[m.type]}</span>
                <span className="flex gap-2 text-xs">
                  <button type="button" onClick={() => deplacer(i, -1)} aria-label="Monter" className="px-2 py-1 border rounded">↑</button>
                  <button type="button" onClick={() => deplacer(i, 1)} aria-label="Descendre" className="px-2 py-1 border rounded">↓</button>
                  <button type="button" onClick={() => retirer(i)} className="px-2 py-1 border rounded text-red-600">Supprimer</button>
                </span>
              </div>

              {m.type === "texte" && (<>
                <label className="block"><span className={etiquette}>Titre (facultatif)</span>
                  <input value={m.titre} maxLength={120} onChange={(e) => maj(i, { titre: e.target.value })} className={champ} /></label>
                <label className="block"><span className={etiquette}>Texte</span>
                  <textarea rows={5} value={m.texte} maxLength={3000} onChange={(e) => maj(i, { texte: e.target.value })} className={champ} /></label>
              </>)}

              {m.type === "photo" && (<>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.url && <img src={m.url} alt="" className="max-h-48 rounded-lg border border-slate-200" />}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => choisirPhoto(i, e.target.files?.[0])} className="text-sm" />
                <label className="block"><span className={etiquette}>Légende (facultatif)</span>
                  <input value={m.legende} maxLength={200} onChange={(e) => maj(i, { legende: e.target.value })} className={champ} /></label>
              </>)}

              {m.type === "galerie" && (<>
                <div className="grid grid-cols-3 gap-2">
                  {m.images.map((im, j) => (
                    <div key={j} className="space-y-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={im.url} alt="" className="w-full aspect-square object-cover rounded-lg border border-slate-200" />
                      <button type="button" className="text-xs text-red-600"
                        onClick={() => maj(i, { images: m.images.filter((_, k) => k !== j) })}>Retirer</button>
                    </div>
                  ))}
                </div>
                {m.images.length < MAX_GALERIE && (
                  <input type="file" multiple accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => { ajouterGalerie(i, e.target.files); e.target.value = ""; }} className="text-sm" />
                )}
                <p className="text-xs text-slate-400">{MAX_GALERIE} photos au maximum.</p>
              </>)}

              {m.type === "infos" && (<>
                {[["adresse", "Adresse"], ["telephone", "Téléphone"], ["email", "E-mail"], ["site", "Site internet (https://...)"]].map(([k, l]) => (
                  <label key={k} className="block"><span className={etiquette}>{l}</span>
                    <input value={m[k]} onChange={(e) => maj(i, { [k]: e.target.value })} className={champ} /></label>
                ))}
                <label className="block"><span className={etiquette}>Horaires</span>
                  <textarea rows={3} value={m.horaires} maxLength={800} onChange={(e) => maj(i, { horaires: e.target.value })} className={champ} /></label>
              </>)}

              {m.type === "bouton" && (<>
                <label className="block"><span className={etiquette}>Texte du bouton</span>
                  <input value={m.libelle} maxLength={60} onChange={(e) => maj(i, { libelle: e.target.value })} className={champ} /></label>
                <label className="block"><span className={etiquette}>Adresse du lien (https://...)</span>
                  <input value={m.url} onChange={(e) => maj(i, { url: e.target.value })} className={champ} /></label>
              </>)}
            </fieldset>
          ))}

          {!verrouille && modules.length < MAX_MODULES && (
            <div className="flex flex-wrap gap-2">
              {Object.keys(NEUF).map((t) => (
                <button key={t} type="button" onClick={() => setModules((ms) => [...ms, structuredClone(NEUF[t])])}
                  className="text-sm border border-sou-blue text-sou-blue px-3 py-1.5 rounded-full hover:bg-sou-blue hover:text-white">
                  + {LIBELLES[t]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setApercu((v) => !v)}
          className="text-sm border border-slate-300 px-4 py-2 rounded-full">{apercu ? "Modifier" : "Aperçu"}</button>
        {!verrouille && (<>
          <button type="button" disabled={occupe} onClick={() => enregistrer(false)}
            className="text-sm border border-sou-blue text-sou-blue px-4 py-2 rounded-full disabled:opacity-50">Enregistrer le brouillon</button>
          <button type="button" disabled={occupe} onClick={() => enregistrer(true)}
            className="text-sm bg-sou-blue text-white font-semibold px-4 py-2 rounded-full hover:bg-sou-gold disabled:opacity-50">Envoyer au bureau pour validation</button>
        </>)}
      </div>
      {!etat.slug && (
        <p className="text-xs text-amber-700 mt-3">
          Votre fiche n&apos;est pas encore reliée à une page du site : le bureau doit le faire avant que votre page puisse apparaître.
        </p>
      )}
    </div>
  );
}
