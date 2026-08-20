// Intégration HelloAsso Checkout (paiement uniquement) — la boutique
// (catalogue, panier) vit entièrement sur notre site ; HelloAsso ne sert
// qu'à encaisser le paiement final via l'API "checkout-intents".
// Doc : https://dev.helloasso.com/docs/api-overview

const API_BASE = process.env.HELLOASSO_API_BASE || "https://api.helloasso.com";
const ORG_SLUG = process.env.HELLOASSO_ORG_SLUG || "sou-des-ecoles-montmerle-lurcy";

let cachedToken = null; // { accessToken, expiresAt }

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 15000) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.HELLOASSO_CLIENT_ID;
  const clientSecret = process.env.HELLOASSO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("HelloAsso non configuré (HELLOASSO_CLIENT_ID / HELLOASSO_CLIENT_SECRET manquants).");
  }

  const res = await fetch(`${API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Authentification HelloAsso refusée (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 1800) * 1000,
  };
  return cachedToken.accessToken;
}

async function haFetch(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}/v5${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message = data?.message || data?.errors?.[0]?.message || text || `Erreur HelloAsso (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return data;
}

// Crée une intention de paiement pour une commande de la boutique.
// `totalCents` doit être le montant exact recalculé côté serveur (jamais
// celui envoyé par le navigateur), en centimes.
export async function createCheckoutIntent({ totalCents, itemName, backUrl, errorUrl, returnUrl, payer, metadata }) {
  return haFetch(`/organizations/${ORG_SLUG}/checkout-intents`, {
    method: "POST",
    body: JSON.stringify({
      totalAmount: totalCents,
      initialAmount: totalCents,
      itemName: itemName.slice(0, 250),
      backUrl,
      errorUrl,
      returnUrl,
      containsDonation: false,
      payer,
      metadata,
    }),
  });
}

export async function getCheckoutIntent(checkoutIntentId) {
  return haFetch(`/organizations/${ORG_SLUG}/checkout-intents/${checkoutIntentId}`);
}

export function isHelloAssoConfigured() {
  return Boolean(process.env.HELLOASSO_CLIENT_ID && process.env.HELLOASSO_CLIENT_SECRET);
}

// IPs officielles des notifications HelloAsso (prod / test), utilisées en
// première ligne de défense sur le webhook. On revérifie ensuite toujours
// le statut réel via l'API (getCheckoutIntent) avant de valider une commande.
export const HELLOASSO_NOTIFICATION_IPS = ["51.138.206.200", "4.233.135.234"];

// Interprète la réponse de GET /checkout-intents/{id} pour savoir si le
// paiement est allé au bout. La forme exacte de la réponse n'a pas pu être
// testée en conditions réelles (pas d'achat test effectué) : ce contrôle
// est volontairement tolérant (plusieurs formes possibles) mais DOIT être
// vérifié lors du premier vrai achat en sandbox avant mise en production.
export function checkoutIntentIsPaid(intent) {
  if (!intent) return false;
  const order = intent.order || intent.data?.order;
  if (order?.payments?.some((p) => /author|paid|completed/i.test(p.state || ""))) {
    return true;
  }
  if (typeof intent.state === "string" && /author|paid|completed/i.test(intent.state)) {
    return true;
  }
  return false;
}
