"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminShell from "../admin-shell";

const VIDE_PRODUIT = { name: "", description: "", priceEuros: "", category: "", boutiqueId: "", active: true };

function euros(cents) {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function formatDateFermeture(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function ProduitForm({ initial, boutiques, boutiqueParDefaut, onSubmit, onCancel, accessToken }) {
  const [form, setForm] = useState(initial || { ...VIDE_PRODUIT, boutiqueId: boutiqueParDefaut || "" });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const fileRef = useRef(null);

  async function televerserImage(file) {
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch("/api/admin/boutique/image", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ dataUrl, filename: file.name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Échec de l'envoi de l'image.");
    return data.url;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      let imageUrl = form.imageUrl;
      const file = fileRef.current?.files?.[0];
      if (file) imageUrl = await televerserImage(file);
      await onSubmit({ ...form, imageUrl });
    } catch (err) {
      setErreur(err.message || "Une erreur est survenue.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500">Nom</label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Prix (€)</label>
          <input
            required
            type="number"
            step="0.01"
            min="0"
            value={form.priceEuros}
            onChange={(e) => setForm({ ...form, priceEuros: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500">Description</label>
        <textarea
          value={form.description || ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          rows={2}
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500">Boutique</label>
        <select
          required
          value={form.boutiqueId || ""}
          onChange={(e) => setForm({ ...form, boutiqueId: e.target.value })}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Choisir une boutique
          </option>
          {(boutiques || []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500">Sous-catégorie (facultatif)</label>
          <input
            value={form.category || ""}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Image</label>
          <input ref={fileRef} type="file" accept="image/*" className="w-full text-sm" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.active !== false}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
        Visible dans la boutique
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={envoi}
          className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {envoi ? "Enregistrement..." : "Enregistrer"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-slate-500 px-4 py-2">
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

function BoutiqueForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial || { name: "", description: "", dateFermeture: "" });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setErreur(err.message || "Une erreur est survenue.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <div>
        <label className="text-xs font-semibold text-slate-500">Nom de la boutique</label>
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Ex : Marché de Noël - Exposants"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500">Description (facultatif)</label>
        <textarea
          value={form.description || ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          rows={2}
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500">
          Date de fermeture des commandes (facultatif)
        </label>
        <input
          type="date"
          value={form.dateFermeture ? form.dateFermeture.slice(0, 10) : ""}
          onChange={(e) =>
            setForm({ ...form, dateFermeture: e.target.value ? `${e.target.value}T23:59:59` : "" })
          }
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <p className="text-xs text-slate-400 mt-1">
          Après cette date, la boutique disparaît automatiquement de la page publique.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={envoi}
          className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {envoi ? "Enregistrement..." : "Enregistrer"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-slate-500 px-4 py-2">
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

function BoutiqueAdmin({ accessToken }) {
  const [boutiques, setBoutiques] = useState([]);
  const [boutiqueFiltre, setBoutiqueFiltre] = useState(null);
  const [produits, setProduits] = useState([]);
  const [commandes, setCommandes] = useState([]);
  const [onglet, setOnglet] = useState("produits"); // produits | commandes | boutiques
  const [nouveau, setNouveau] = useState(false);
  const [enEdition, setEnEdition] = useState(null);
  const [nouvelleBoutique, setNouvelleBoutique] = useState(false);
  const [boutiqueEnEdition, setBoutiqueEnEdition] = useState(null);
  const [chargement, setChargement] = useState(true);

  const chargerBoutiques = useCallback(async () => {
    const res = await fetch("/api/admin/boutique/boutiques", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    const liste = data.boutiques || [];
    setBoutiques(liste);
    setBoutiqueFiltre((courant) => courant || liste[0]?.id || null);
    if (liste.length === 0) setChargement(false);
  }, [accessToken]);

  const charger = useCallback(async () => {
    if (!boutiqueFiltre) return;
    setChargement(true);
    const [pRes, cRes] = await Promise.all([
      fetch(`/api/admin/boutique/produits?boutiqueId=${boutiqueFiltre}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch("/api/admin/boutique/commandes", { headers: { Authorization: `Bearer ${accessToken}` } }),
    ]);
    const pData = await pRes.json();
    const cData = await cRes.json();
    setProduits(pData.products || []);
    setCommandes(cData.orders || []);
    setChargement(false);
  }, [accessToken, boutiqueFiltre]);

  useEffect(() => {
    chargerBoutiques();
  }, [chargerBoutiques]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function creer(form) {
    const res = await fetch("/api/admin/boutique/produits", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setNouveau(false);
    charger();
  }

  async function modifier(id, form) {
    const res = await fetch(`/api/admin/boutique/produits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setEnEdition(null);
    charger();
  }

  // Deplace un produit d'un cran vers le haut ou vers le bas en echangeant
  // sa position avec celle de son voisin. L'ordre affiche cote public suit
  // la colonne position, donc l'echange suffit.
  // La liste est triee par categorie puis par position : un produit ne peut
  // donc etre deplace qu'a l'interieur de sa propre categorie.
  function peutDeplacer(index, direction) {
    const voisin = index + direction;
    if (voisin < 0 || voisin >= produits.length) return false;
    return (produits[index].category || "") === (produits[voisin].category || "");
  }

  async function deplacer(index, direction) {
    if (!peutDeplacer(index, direction)) return;
    const voisin = index + direction;

    const a = produits[index];
    const b = produits[voisin];

    // Reordonnancement optimiste : on inverse les deux lignes tout de suite
    // pour que le clic soit ressenti comme immediat.
    const copie = [...produits];
    copie[index] = b;
    copie[voisin] = a;
    setProduits(copie);

    const majPosition = (produit, position) =>
      fetch(`/api/admin/boutique/produits/${produit.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ position }),
      });

    // Les positions enregistrees peuvent etre identiques ou mal espacees
    // (produits importes). On reecrit donc l'index de chaque ligne plutot
    // que d'echanger deux valeurs qui pourraient etre egales.
    await Promise.all(copie.map((prod, i) => majPosition(prod, i)));
    await charger();
  }

  async function supprimer(id) {
    if (!confirm("Supprimer ce produit ?")) return;
    await fetch(`/api/admin/boutique/produits/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    charger();
  }

  async function creerBoutique(form) {
    const res = await fetch("/api/admin/boutique/boutiques", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setNouvelleBoutique(false);
    await chargerBoutiques();
  }

  async function modifierBoutique(id, form) {
    const res = await fetch(`/api/admin/boutique/boutiques/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setBoutiqueEnEdition(null);
    await chargerBoutiques();
  }

  async function basculerActiveBoutique(b) {
    await fetch(`/api/admin/boutique/boutiques/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ active: !b.active }),
    });
    chargerBoutiques();
  }

  if (chargement) return <p className="text-slate-500 text-sm">Chargement...</p>;

  const boutiqueActive = boutiques.find((b) => b.id === boutiqueFiltre);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 text-sm font-semibold">
        <button
          onClick={() => setOnglet("produits")}
          className={`px-3 py-1.5 rounded-full ${onglet === "produits" ? "bg-sou-blue text-white" : "bg-slate-100 text-slate-600"}`}
        >
          Produits
        </button>
        <button
          onClick={() => setOnglet("commandes")}
          className={`px-3 py-1.5 rounded-full ${onglet === "commandes" ? "bg-sou-blue text-white" : "bg-slate-100 text-slate-600"}`}
        >
          Commandes ({commandes.length})
        </button>
        <button
          onClick={() => setOnglet("boutiques")}
          className={`px-3 py-1.5 rounded-full ${onglet === "boutiques" ? "bg-sou-blue text-white" : "bg-slate-100 text-slate-600"}`}
        >
          Boutiques ({boutiques.length})
        </button>
      </div>

      {onglet === "produits" && (
        <div className="space-y-4">
          {boutiques.length === 0 ? (
            <p className="text-sm text-slate-500">
              Créez d&apos;abord une boutique dans l&apos;onglet « Boutiques » avant d&apos;ajouter des produits.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-semibold text-slate-500">Boutique :</label>
                <select
                  value={boutiqueFiltre || ""}
                  onChange={(e) => setBoutiqueFiltre(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                >
                  {boutiques.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                {boutiqueActive?.date_fermeture && (
                  <span className="text-xs text-slate-400">
                    Ferme le {formatDateFermeture(boutiqueActive.date_fermeture)}
                  </span>
                )}
              </div>

              {!nouveau && (
                <button
                  onClick={() => setNouveau(true)}
                  className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-lg"
                >
                  + Ajouter un produit
                </button>
              )}
              {nouveau && (
                <ProduitForm
                  accessToken={accessToken}
                  boutiques={boutiques}
                  boutiqueParDefaut={boutiqueFiltre}
                  onSubmit={creer}
                  onCancel={() => setNouveau(false)}
                />
              )}

              <div className="space-y-3">
                {produits.map((p, index) =>
                  enEdition === p.id ? (
                    <ProduitForm
                      key={p.id}
                      accessToken={accessToken}
                      boutiques={boutiques}
                      initial={{
                        name: p.name,
                        description: p.description,
                        priceEuros: (p.price_cents / 100).toString(),
                        category: p.category,
                        boutiqueId: p.boutique_id,
                        active: p.active,
                        imageUrl: p.image_url,
                      }}
                      onSubmit={(form) => modifier(p.id, form)}
                      onCancel={() => setEnEdition(null)}
                    />
                  ) : (
                    <div
                      key={p.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4"
                    >
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => deplacer(index, -1)}
                          disabled={!peutDeplacer(index, -1)}
                          title="Monter"
                          aria-label={`Monter ${p.name}`}
                          className="w-7 h-6 rounded border border-slate-200 text-slate-600 leading-none disabled:opacity-30 hover:bg-slate-50"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => deplacer(index, 1)}
                          disabled={!peutDeplacer(index, 1)}
                          title="Descendre"
                          aria-label={`Descendre ${p.name}`}
                          className="w-7 h-6 rounded border border-slate-200 text-slate-600 leading-none disabled:opacity-30 hover:bg-slate-50"
                        >
                          ↓
                        </button>
                      </div>
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_url} alt="" className="w-14 h-14 object-cover rounded-lg" />
                      ) : (
                        <div className="w-14 h-14 bg-slate-100 rounded-lg" />
                      )}
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800">
                          {p.name}{" "}
                          {!p.active && <span className="text-xs text-slate-400">(masqué)</span>}
                        </p>
                        <p className="text-xs text-slate-500">
                          {p.category || "Sans sous-catégorie"} · {euros(p.price_cents)}
                        </p>
                      </div>
                      <button
                        onClick={() => setEnEdition(p.id)}
                        className="text-sm text-sou-blue font-semibold"
                      >
                        Modifier
                      </button>
                      <button onClick={() => supprimer(p.id)} className="text-sm text-red-600">
                        Supprimer
                      </button>
                    </div>
                  )
                )}
                {produits.length === 0 && (
                  <p className="text-sm text-slate-500">Aucun produit dans cette boutique pour le moment.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {onglet === "commandes" && (
        <div className="space-y-2">
          {commandes.map((c) => (
            <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-slate-800">
                    {c.buyer_first_name} {c.buyer_last_name}{" "}
                    <span className="text-xs text-slate-400">({c.buyer_email})</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {(c.items || []).map((it) => `${it.qty}x ${it.name}`).join(", ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sou-blue">{euros(c.total_cents)}</p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      c.status === "paid"
                        ? "bg-green-100 text-green-700"
                        : c.status === "failed" || c.status === "cancelled"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {c.status === "paid" ? "Payée" : c.status === "pending" ? "En attente" : c.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {commandes.length === 0 && (
            <p className="text-sm text-slate-500">Aucune commande pour le moment.</p>
          )}
        </div>
      )}

      {onglet === "boutiques" && (
        <div className="space-y-4">
          {!nouvelleBoutique && (
            <button
              onClick={() => setNouvelleBoutique(true)}
              className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              + Nouvelle boutique
            </button>
          )}
          {nouvelleBoutique && (
            <BoutiqueForm onSubmit={creerBoutique} onCancel={() => setNouvelleBoutique(false)} />
          )}

          <div className="space-y-3">
            {boutiques.map((b) =>
              boutiqueEnEdition === b.id ? (
                <BoutiqueForm
                  key={b.id}
                  initial={{ name: b.name, description: b.description, dateFermeture: b.date_fermeture }}
                  onSubmit={(form) => modifierBoutique(b.id, form)}
                  onCancel={() => setBoutiqueEnEdition(null)}
                />
              ) : (
                <div
                  key={b.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">
                      {b.name}{" "}
                      {!b.active && <span className="text-xs text-slate-400">(désactivée)</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {b.produits} produit{b.produits > 1 ? "s" : ""}
                      {b.date_fermeture ? ` · ferme le ${formatDateFermeture(b.date_fermeture)}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setBoutiqueEnEdition(b.id)}
                    className="text-sm text-sou-blue font-semibold"
                  >
                    Modifier
                  </button>
                  <button onClick={() => basculerActiveBoutique(b)} className="text-sm text-slate-500">
                    {b.active ? "Désactiver" : "Réactiver"}
                  </button>
                </div>
              )
            )}
            {boutiques.length === 0 && (
              <p className="text-sm text-slate-500">Aucune boutique pour le moment.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminBoutiquePage() {
  return (
    <AdminShell title="Boutique">
      {(accessToken) => (
        <div>
          <h1 className="text-2xl font-bold text-sou-blue mb-1">Boutique en ligne</h1>
          <p className="text-slate-500 text-sm mb-6">
            Produits proposés à la vente sur /boutique et suivi des commandes réglées via HelloAsso.
          </p>
          <BoutiqueAdmin accessToken={accessToken} />
        </div>
      )}
    </AdminShell>
  );
}
