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

// Texte envoyé à HelloAsso : sans caractères de contrôle ni symboles exotiques
// (émojis, retours à la ligne…). Une partie des libellés vient de ce que les
// acheteurs ont tapé (prénom d'une boule personnalisée, etc.).
function nettoyer(texte, max) {
  return String(texte ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[^\p{L}\p{N}\s.,;:()'’\-–—/&+€%!?"«»]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
const lettresSeulement = (texte, max) =>
  String(texte ?? "").normalize("NFC").replace(/[^\p{L}\s'’-]/gu, "").replace(/\s+/g, " ").trim().slice(0, max);

// Crée une intention de paiement pour une commande de la boutique.
// `totalCents` doit être le montant exact recalculé côté serveur (jamais
// celui envoyé par le navigateur), en centimes.
//
// HelloAsso refuse parfois la création (message d'erreur non conservé jusqu'ici,
// d'où des commandes « failed » inexpliquées). On fait donc un SECOND essai avec
// un libellé neutre et des noms ne comportant que des lettres, et on garde le
// message du premier refus (`avertissement`) pour comprendre la cause. Seules
// les erreurs d'authentification ne sont pas rejouées.
export async function createCheckoutIntent({ totalCents, itemName, backUrl, errorUrl, returnUrl, payer, metadata }) {
  const essais = [
    {
      itemName: nettoyer(itemName, 250) || "Boutique Sou des Écoles",
      payer: {
        ...payer,
        firstName: nettoyer(payer?.firstName, 60) || payer?.firstName,
        lastName: nettoyer(payer?.lastName, 60) || payer?.lastName,
        email: String(payer?.email || "").trim(),
      },
    },
    {
      itemName: "Boutique Sou des Écoles — commande",
      payer: {
        ...payer,
        firstName: lettresSeulement(payer?.firstName, 60) || "Client",
        lastName: lettresSeulement(payer?.lastName, 60) || "Boutique",
        email: String(payer?.email || "").trim().toLowerCase(),
      },
    },
  ];

  const erreurs = [];
  for (const essai of essais) {
    try {
      const intent = await haFetch(`/organizations/${ORG_SLUG}/checkout-intents`, {
        method: "POST",
        body: JSON.stringify({
          totalAmount: totalCents,
          initialAmount: totalCents,
          itemName: essai.itemName,
          backUrl,
          errorUrl,
          returnUrl,
          containsDonation: false,
          payer: essai.payer,
          metadata,
        }),
      });
      if (erreurs.length) intent.avertissement = `1er essai refusé : ${erreurs[0]}`;
      return intent;
    } catch (err) {
      erreurs.push(`${err.status || "?"} ${err.message}`.slice(0, 300));
      console.error("[helloasso] création de l'intention refusée :", erreurs[erreurs.length - 1]);
      if (err.status === 401 || err.status === 403) break;
    }
  }
  const erreurFinale = new Error(erreurs.join(" | "));
  erreurFinale.status = 502;
  throw erreurFinale;
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
