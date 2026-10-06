"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components";
import { createClient } from "../lib/supabaseClient";

function euros(cents) {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function formatDateFermeture(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export default function BoutiquePage() {
  const [produits, setProduits] = useState([]);
  const [boutiqueActiveId, setBoutiqueActiveId] = useState(null);
  // Lignes du panier : un produit sans personnalisation = une ligne ; avec
  // personnalisations, une ligne par combinaison choisie (taille M, taille L...).
  const [panier, setPanier] = useState([]); // [{ cle, productId, qty, choix }]
  // Personnalisations en cours de saisie sur les fiches produit.
  const [saisies, setSaisies] = useState({}); // { productId: { optionId: valeur } }
  const [erreursProduit, setErreursProduit] = useState({}); // { productId: message }
  const [moi, setMoi] = useState(null); // parent connecté, ou null
  const [accessToken, setAccessToken] = useState(null);
  const [buyer, setBuyer] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [etape, setEtape] = useState("catalogue"); // catalogue | paiement | confirme
  const [redirectUrl, setRedirectUrl] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [statutCommande, setStatutCommande] = useState(null);

  // Catalogue + identification facultative de l'acheteur connecté.
  useEffect(() => {
    fetch("/api/boutique/produits")
      .then((r) => r.json())
      .then((d) => {
        const liste = d.products || [];
        setProduits(liste);
        const premiereBoutique = liste
          .map((p) => p.boutiques)
          .filter(Boolean)
          .sort((a, b) => (a.position || 0) - (b.position || 0))[0];
        if (premiereBoutique) setBoutiqueActiveId(premiereBoutique.id);
      });

    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      setAccessToken(session.access_token);
      const res = await fetch("/api/boutique/moi", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.parent) {
        setMoi(data.parent);
        setBuyer({
          firstName: data.parent.firstName,
          lastName: data.parent.lastName,
          email: data.parent.email,
          phone: data.parent.phone || "",
        });
      }
    })();
  }, []);

  // Retour depuis HelloAsso (paiement en pleine page, hors iframe) ou reprise
  // d'une commande en cours via ?commande=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const commande = params.get("commande");
    if (commande) {
      setOrderId(commande);
      setEtape("confirme");
      verifierCommande(commande);
    }
  }, []);

  async function verifierCommande(id) {
    setEtape("confirme");
    const res = await fetch(`/api/boutique/commande/${id}`);
    const data = await res.json();
    if (res.ok) setStatutCommande(data.order);
  }

  const boutiques = useMemo(() => {
    const parId = new Map();
    for (const p of produits) {
      if (p.boutiques && !parId.has(p.boutiques.id)) parId.set(p.boutiques.id, p.boutiques);
    }
    return Array.from(parId.values()).sort((a, b) => (a.position || 0) - (b.position || 0));
  }, [produits]);

  const boutiqueActive = boutiques.find((b) => b.id === boutiqueActiveId) || null;

  const categories = useMemo(() => {
    const groupes = new Map();
    for (const p of produits) {
      if (boutiqueActiveId && p.boutique_id !== boutiqueActiveId) continue;
      const cat = p.category || "Boutique";
      if (!groupes.has(cat)) groupes.set(cat, []);
      groupes.get(cat).push(p);
    }
    return Array.from(groupes.entries());
  }, [produits, boutiqueActiveId]);

  // Supplément d'une ligne (affichage seulement : le serveur recalcule tout).
  function supplement(produit, choix) {
    let extra = 0;
    for (const opt of produit.options || []) {
      const v = (choix?.[opt.id] || "").trim();
      if (!v) continue;
      if (opt.type === "texte") extra += opt.extraCents || 0;
      else extra += (opt.choices || []).find((c) => c.label === v)?.extraCents || 0;
    }
    return extra;
  }

  const lignesPanier = useMemo(() => {
    return panier
      .filter((l) => l.qty > 0)
      .map((l) => {
        const produit = produits.find((p) => p.id === l.productId);
        if (!produit) return null;
        return { ...l, produit, prixUnitaire: produit.price_cents + supplement(produit, l.choix) };
      })
      .filter(Boolean);
  }, [panier, produits]);

  const totalCents = lignesPanier.reduce((sum, l) => sum + l.prixUnitaire * l.qty, 0);

  // Quantité déjà au panier pour un produit (toutes personnalisations confondues).
  const qtyProduit = (id) => panier.filter((l) => l.productId === id).reduce((n, l) => n + l.qty, 0);

  function plafond(produit) {
    const stock = produit.remaining != null ? produit.remaining : 20;
    return Math.min(20, stock);
  }

  function libelleChoix(produit, choix) {
    return (produit.options || [])
      .map((o) => (choix?.[o.id] ? `${o.label} : ${choix[o.id]}` : null))
      .filter(Boolean)
      .join(", ");
  }

  // Ajoute (ou retire, delta < 0) un exemplaire d'une ligne du panier.
  function ajouter(produit, delta, choix = {}) {
    const cle = `${produit.id}|${JSON.stringify(
      Object.fromEntries(Object.entries(choix).filter(([, v]) => v && String(v).trim()).sort())
    )}`;
    setPanier((courant) => {
      const existante = courant.find((l) => l.cle === cle);
      if (delta > 0 && courant.filter((l) => l.productId === produit.id).reduce((n, l) => n + l.qty, 0) >= plafond(produit)) {
        return courant;
      }
      if (existante) {
        return courant
          .map((l) => (l.cle === cle ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
          .filter((l) => l.qty > 0);
      }
      if (delta <= 0) return courant;
      return [...courant, { cle, productId: produit.id, qty: 1, choix }];
    });
  }

  // Produit avec personnalisations : on valide la saisie avant d'ajouter.
  function ajouterAvecChoix(produit) {
    const choix = saisies[produit.id] || {};
    for (const opt of produit.options || []) {
      if (opt.required && !(choix[opt.id] || "").trim()) {
        setErreursProduit((e) => ({ ...e, [produit.id]: `Merci de renseigner « ${opt.label} ».` }));
        return;
      }
    }
    setErreursProduit((e) => ({ ...e, [produit.id]: "" }));
    ajouter(produit, 1, choix);
  }

  async function commander(e) {
    e.preventDefault();
    setErreur("");
    if (lignesPanier.length === 0) {
      setErreur("Votre panier est vide.");
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch("/api/boutique/commander", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          items: lignesPanier.map((l) => ({ productId: l.produit.id, qty: l.qty, choix: l.choix })),
          buyer,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
      setOrderId(data.orderId);
      setRedirectUrl(data.redirectUrl);
      setEtape("paiement");
      // HelloAsso interdit l'affichage en iframe : on quitte le site le temps
      // du paiement, le retour est assuré par returnUrl (?commande=...).
      window.location.href = data.redirectUrl;
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Boutique"
        subtitle="Précommandez en ligne pour les manifestations du Sou des Écoles — paiement sécurisé, ouvert à tous."
      />

      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        {etape === "catalogue" && (
          <div className="grid lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 space-y-6">
              {boutiques.length > 1 && (
                <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
                  {boutiques.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setBoutiqueActiveId(b.id)}
                      className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                        boutiqueActiveId === b.id
                          ? "bg-sou-blue text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
              {boutiqueActive?.description && (
                <p className="text-slate-500 text-sm">{boutiqueActive.description}</p>
              )}
              {boutiqueActive?.date_fermeture && (
                <p className="text-amber-600 text-xs font-medium">
                  Commandes ouvertes jusqu&apos;au {formatDateFermeture(boutiqueActive.date_fermeture)}
                </p>
              )}
              <div className="space-y-10">
              {categories.length === 0 && (
                <p className="text-slate-500">Aucun produit disponible pour le moment.</p>
              )}
              {categories.map(([cat, items]) => (
                <div key={cat}>
                  <h2 className="text-lg font-bold text-sou-blue mb-4">{cat}</h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {items.map((p) => (
                      <div key={p.id} className="border border-slate-200 rounded-xl p-4 flex flex-col">
                        {p.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url} alt={p.name} className="w-full h-32 object-cover rounded-lg mb-3" />
                        )}
                        <p className="font-semibold text-slate-800">{p.name}</p>
                        {p.description && <p className="text-sm text-slate-500 mt-1 flex-1">{p.description}</p>}
                        {(p.options || []).length > 0 && p.remaining !== 0 && (
                          <div className="mt-3 space-y-2">
                            {p.options.map((o) => (
                              <div key={o.id}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">
                                  {o.label}
                                  {o.required ? " *" : ""}
                                  {o.type === "texte" && o.extraCents > 0
                                    ? ` (+ ${euros(o.extraCents)})`
                                    : ""}
                                </label>
                                {o.type === "texte" ? (
                                  <input
                                    value={saisies[p.id]?.[o.id] || ""}
                                    maxLength={120}
                                    onChange={(e) =>
                                      setSaisies((st) => ({
                                        ...st,
                                        [p.id]: { ...(st[p.id] || {}), [o.id]: e.target.value },
                                      }))
                                    }
                                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                                  />
                                ) : (
                                  <select
                                    value={saisies[p.id]?.[o.id] || ""}
                                    onChange={(e) =>
                                      setSaisies((st) => ({
                                        ...st,
                                        [p.id]: { ...(st[p.id] || {}), [o.id]: e.target.value },
                                      }))
                                    }
                                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                                  >
                                    <option value="">{o.required ? "Choisir..." : "Aucun"}</option>
                                    {o.choices.map((c) => (
                                      <option key={c.label} value={c.label}>
                                        {c.label}
                                        {c.extraCents > 0 ? ` (+ ${euros(c.extraCents)})` : ""}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            ))}
                            {erreursProduit[p.id] && (
                              <p className="text-xs text-red-600">{erreursProduit[p.id]}</p>
                            )}
                          </div>
                        )}
                        {p.remaining !== null && p.remaining !== undefined && (
                          <p className={`text-xs font-medium mt-2 ${p.remaining === 0 ? "text-red-600" : "text-amber-600"}`}>
                            {p.remaining === 0
                              ? "Épuisé"
                              : `Plus que ${p.remaining} exemplaire${p.remaining > 1 ? "s" : ""}`}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-3">
                          <span className="font-semibold text-sou-blue">
                            {(p.options || []).some((o) => (o.type === "texte" ? o.extraCents > 0 : o.choices.some((c) => c.extraCents > 0)))
                              ? "dès "
                              : ""}
                            {euros(p.price_cents)}
                          </span>
                          {p.remaining === 0 ? (
                            <span className="text-sm text-slate-400">Indisponible</span>
                          ) : (p.options || []).length > 0 ? (
                            <button
                              onClick={() => ajouterAvecChoix(p)}
                              disabled={qtyProduit(p.id) >= plafond(p)}
                              className="bg-sou-blue text-white text-sm font-semibold px-4 py-1.5 rounded-full disabled:opacity-40"
                            >
                              Ajouter au panier
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => ajouter(p, -1)}
                                className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 font-bold"
                              >
                                −
                              </button>
                              <span className="w-5 text-center text-sm">{qtyProduit(p.id)}</span>
                              <button
                                onClick={() => ajouter(p, 1)}
                                disabled={qtyProduit(p.id) >= plafond(p)}
                                className="w-7 h-7 rounded-full bg-sou-blue text-white font-bold disabled:opacity-40"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              </div>
            </div>

            <div>
              <div className="border border-slate-200 rounded-xl p-5 sticky top-24">
                <h3 className="font-bold text-slate-800 mb-3">Votre panier</h3>
                {lignesPanier.length === 0 ? (
                  <p className="text-sm text-slate-500">Ajoutez des produits pour commencer.</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {lignesPanier.map((l) => (
                      <div key={l.cle} className="flex justify-between gap-2 text-sm">
                        <span>
                          {l.qty} × {l.produit.name}
                          {libelleChoix(l.produit, l.choix) && (
                            <span className="block text-xs text-slate-500">
                              {libelleChoix(l.produit, l.choix)}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 mt-0.5">
                            <button
                              type="button"
                              onClick={() => ajouter(l.produit, -1, l.choix)}
                              className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold"
                              aria-label="Retirer un exemplaire"
                            >
                              −
                            </button>
                            <button
                              type="button"
                              onClick={() => ajouter(l.produit, 1, l.choix)}
                              disabled={qtyProduit(l.produit.id) >= plafond(l.produit)}
                              className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold disabled:opacity-40"
                              aria-label="Ajouter un exemplaire"
                            >
                              +
                            </button>
                          </span>
                        </span>
                        <span className="whitespace-nowrap">{euros(l.prixUnitaire * l.qty)}</span>
                      </div>
                    ))}
                    <div className="border-t border-slate-200 pt-2 flex justify-between font-semibold">
                      <span>Total</span>
                      <span>{euros(totalCents)}</span>
                    </div>
                  </div>
                )}

                {lignesPanier.length > 0 && (
                  <form onSubmit={commander} className="space-y-2">
                    <input
                      required
                      placeholder="Prénom"
                      value={buyer.firstName}
                      onChange={(e) => setBuyer({ ...buyer, firstName: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      required
                      placeholder="Nom"
                      value={buyer.lastName}
                      onChange={(e) => setBuyer({ ...buyer, lastName: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      required
                      type="email"
                      placeholder="E-mail"
                      value={buyer.email}
                      onChange={(e) => setBuyer({ ...buyer, email: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      required
                      type="tel"
                      placeholder="Téléphone"
                      value={buyer.phone}
                      onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                    {erreur && <p className="text-sm text-red-600">{erreur}</p>}
                    <button
                      type="submit"
                      disabled={envoi}
                      className="w-full bg-sou-blue text-white font-semibold py-2.5 rounded-full disabled:opacity-50"
                    >
                      {envoi ? "Préparation du paiement..." : "Passer au paiement"}
                    </button>
                    <p className="text-xs text-slate-400 text-center">
                      Paiement sécurisé via HelloAsso.
                    </p>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {etape === "paiement" && redirectUrl && (
          <div>
            <button onClick={() => setEtape("catalogue")} className="text-sm text-slate-500 mb-4">
              ← Retour au panier
            </button>
            <div className="border border-slate-200 rounded-xl p-6 text-sm text-slate-600 max-w-md">
              <p className="mb-3">Redirection vers le paiement sécurisé HelloAsso...</p>
              <a
                href={redirectUrl}
                className="inline-block bg-sou-blue text-white font-semibold px-5 py-2.5 rounded-full"
              >
                Continuer vers le paiement
              </a>
              <p className="mt-3 text-xs text-slate-400">
                Si rien ne se passe, cliquez sur le bouton ci-dessus.
              </p>
            </div>
          </div>
        )}

        {etape === "confirme" && (
          <div className="max-w-md mx-auto text-center py-12">
            {statutCommande?.status === "paid" ? (
              <>
                <p className="text-3xl mb-3">✅</p>
                <h2 className="text-xl font-bold text-sou-blue mb-2">Merci pour votre commande !</h2>
                <p className="text-slate-600">
                  Votre paiement a bien été reçu ({euros(statutCommande.totalCents)}). Un e-mail de confirmation
                  vous sera envoyé par HelloAsso.
                </p>
              </>
            ) : (
              <>
                <p className="text-3xl mb-3">⏳</p>
                <h2 className="text-xl font-bold text-sou-blue mb-2">Paiement en cours de vérification...</h2>
                <p className="text-slate-600 mb-4">
                  Si vous venez de payer, ça ne prend que quelques secondes.
                </p>
                <button
                  onClick={() => verifierCommande(orderId)}
                  className="bg-sou-blue text-white text-sm font-semibold px-5 py-2 rounded-full"
                >
                  Vérifier à nouveau
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </>
  );
}
