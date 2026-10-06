// Personnalisations d'un produit de la boutique (taille, couleur, texte à
// graver...), avec un éventuel supplément de prix, et quantité limite.
//
// Une option est définie sur le produit (colonne shop_products.options, jsonb) :
//   { id, label, type: "choix" | "texte", required, extraCents, choices }
//   - "choix"  : liste de choix { label, extraCents } (ex. Taille : S, M, L +2 €)
//   - "texte"  : saisie libre ; extraCents s'applique si le texte est rempli
// Le client envoie seulement les valeurs choisies ({ [optionId]: valeur }) :
// le prix est TOUJOURS recalculé côté serveur à partir de ces définitions.

const MAX_OPTIONS = 6;
const MAX_CHOIX = 20;
const MAX_TEXTE = 120;

const entierCents = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Valide et nettoie les définitions saisies dans le back-office.
export function nettoyerOptions(entree) {
  if (!Array.isArray(entree)) return { options: [], error: null };
  const options = [];
  for (const brut of entree.slice(0, MAX_OPTIONS)) {
    const label = String(brut?.label || "").trim().slice(0, 60);
    if (!label) continue;
    const type = brut?.type === "texte" ? "texte" : "choix";
    const option = {
      id: String(brut?.id || `o${options.length + 1}${Date.now().toString(36)}`).slice(0, 40),
      label,
      type,
      required: Boolean(brut?.required),
    };
    if (type === "texte") {
      option.extraCents = entierCents(brut?.extraCents);
    } else {
      const choices = [];
      for (const c of Array.isArray(brut?.choices) ? brut.choices.slice(0, MAX_CHOIX) : []) {
        const cl = String(c?.label || "").trim().slice(0, 60);
        if (cl && !choices.some((x) => x.label === cl)) {
          choices.push({ label: cl, extraCents: entierCents(c?.extraCents) });
        }
      }
      if (choices.length === 0) {
        return { options: [], error: `L'option « ${label} » doit avoir au moins un choix.` };
      }
      option.choices = choices;
    }
    options.push(option);
  }
  return { options, error: null };
}

// Quantité limite : null = illimité ; sinon entier >= 0.
export function nettoyerQuantiteMax(valeur) {
  if (valeur === undefined) return undefined;
  if (valeur === null || valeur === "") return null;
  const n = Math.floor(Number(valeur));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Valide les valeurs choisies pour un produit et calcule le supplément.
// Renvoie { error } ou { extraCents, details: [{ label, value, extraCents }] }.
export function appliquerChoix(optionsProduit, choixClient) {
  const options = Array.isArray(optionsProduit) ? optionsProduit : [];
  const choix = choixClient && typeof choixClient === "object" ? choixClient : {};
  const details = [];
  let extraCents = 0;

  for (const opt of options) {
    const brut = choix[opt.id];
    const valeur = typeof brut === "string" ? brut.trim() : "";

    if (!valeur) {
      if (opt.required) return { error: `Merci de renseigner « ${opt.label} ».` };
      continue;
    }

    if (opt.type === "texte") {
      const texte = valeur.slice(0, MAX_TEXTE);
      const extra = opt.extraCents || 0;
      details.push({ label: opt.label, value: texte, extraCents: extra });
      extraCents += extra;
    } else {
      const trouve = (opt.choices || []).find((c) => c.label === valeur);
      if (!trouve) return { error: `Choix invalide pour « ${opt.label} ».` };
      details.push({ label: opt.label, value: trouve.label, extraCents: trouve.extraCents || 0 });
      extraCents += trouve.extraCents || 0;
    }
  }
  return { extraCents, details };
}

// Quantités déjà vendues (ou en cours de paiement) par produit, pour les
// produits à quantité limitée. Une commande « en attente » ne réserve le
// stock que pendant 30 minutes (le temps de payer) : au-delà elle est ignorée.
const RESERVATION_MS = 30 * 60 * 1000;

export async function quantitesVendues(admin) {
  const { data } = await admin
    .from("shop_orders")
    .select("items, status, created_at")
    .in("status", ["paid", "pending"]);

  const vendues = {};
  const limite = Date.now() - RESERVATION_MS;
  for (const o of data || []) {
    if (o.status === "pending" && new Date(o.created_at).getTime() < limite) continue;
    for (const it of Array.isArray(o.items) ? o.items : []) {
      if (!it?.productId) continue;
      vendues[it.productId] = (vendues[it.productId] || 0) + (Number(it.qty) || 0);
    }
  }
  return vendues;
}
