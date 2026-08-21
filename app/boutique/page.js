"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components";
import { createClient } from "../lib/supabaseClient";

function euros(cents) {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

export default function BoutiquePage() {
  const [produits, setProduits] = useState([]);
  const [panier, setPanier] = useState({}); // { productId: qty }
  const [moi, setMoi] = useState(null); // parent connecté, ou null
  const [accessToken, setAccessToken] = useState(null);
  const [buyer, setBuyer] = useState({ firstName: "", lastName: "", email: "" });
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
      .then((d) => setProduits(d.products || []));

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
        setBuyer({ firstName: data.parent.firstName, lastName: data.parent.lastName, email: data.parent.email });
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

  const categories = useMemo(() => {
    const groupes = new Map();
    for (const p of produits) {
      const cat = p.category || "Boutique";
      if (!groupes.has(cat)) groupes.set(cat, []);
      groupes.get(cat).push(p);
    }
    return Array.from(groupes.entries());
  }, [produits]);

  const lignesPanier = useMemo(() => {
    return Object.entries(panier)
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => {
        const produit = produits.find((p) => p.id === productId);
        return produit ? { produit, qty } : null;
      })
      .filter(Boolean);
  }, [panier, produits]);

  const totalCents = lignesPanier.reduce((sum, l) => sum + l.produit.price_cents * l.qty, 0);

  function ajouter(id, delta) {
    setPanier((p) => {
      const qty = Math.max(0, Math.min(20, (p[id] || 0) + delta));
      return { ...p, [id]: qty };
    });
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
          items: lignesPanier.map((l) => ({ productId: l.produit.id, qty: l.qty })),
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
            <div className="lg:col-span-2 space-y-10">
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
                        <div className="flex items-center justify-between mt-3">
                          <span className="font-semibold text-sou-blue">{euros(p.price_cents)}</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => ajouter(p.id, -1)}
                              className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 font-bold"
                            >
                              −
                            </button>
                            <span className="w-5 text-center text-sm">{panier[p.id] || 0}</span>
                            <button
                              onClick={() => ajouter(p.id, 1)}
                              className="w-7 h-7 rounded-full bg-sou-blue text-white font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="border border-slate-200 rounded-xl p-5 sticky top-24">
                <h3 className="font-bold text-slate-800 mb-3">Votre panier</h3>
                {lignesPanier.length === 0 ? (
                  <p className="text-sm text-slate-500">Ajoutez des produits pour commencer.</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {lignesPanier.map((l) => (
                      <div key={l.produit.id} className="flex justify-between text-sm">
                        <span>
                          {l.qty} × {l.produit.name}
                        </span>
                        <span>{euros(l.produit.price_cents * l.qty)}</span>
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
