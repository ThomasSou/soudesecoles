// Répartition du montant d'une ligne « classe » ou « événement » entre les
// classes / manifestations qu'elle concerne.
//
//   - "egale"        : division automatique à parts égales. Le reste en
//                      centimes va aux premières (somme = montant exact).
//   - "differenciee" : un montant est saisi pour chaque classe / manif ;
//                      la somme doit être exactement égale au montant de la
//                      ligne, sinon c'est refusé.
//
// Les tables de liaison (compta_ligne_classes, compta_ligne_evenements)
// stockent `montant_cents` par lien : NULL en mode égal (recalculé à la
// lecture), la valeur saisie en mode différencié.

export function repartirEgal(totalCents, n) {
  const base = Math.floor(totalCents / n);
  const reste = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < reste ? 1 : 0));
}

// Valide et résout une répartition demandée.
//   cles           : string[]  (clés de classe ou ids de manifestation)
//   mode           : "egale" | "differenciee"
//   montantsBruts  : { [cle]: string | number }   (mode différencié)
//   totalCents     : entier, montant de la ligne
//   libelle        : (cle) => string   (pour les messages d'erreur)
// Renvoie { montants: { [cle]: number|null } | null, error: string|null }.
export function resoudreRepartition({ cles, mode, montantsBruts, totalCents, libelle }) {
  const nom = typeof libelle === "function" ? libelle : (c) => c;

  if (mode !== "differenciee") {
    return { montants: Object.fromEntries(cles.map((c) => [c, null])), error: null };
  }

  const montants = {};
  let somme = 0;
  for (const c of cles) {
    const v = Number(String(montantsBruts?.[c] ?? "").replace(",", "."));
    if (!Number.isFinite(v) || v < 0) {
      return { montants: null, error: `Montant manquant ou invalide pour « ${nom(c)} ».` };
    }
    const cents = Math.round(v * 100);
    montants[c] = cents;
    somme += cents;
  }
  if (somme !== totalCents) {
    return {
      montants: null,
      error:
        `La somme des montants répartis (${(somme / 100).toFixed(2)} €) ne correspond ` +
        `pas au montant de la ligne (${(totalCents / 100).toFixed(2)} €).`,
    };
  }
  return { montants, error: null };
}
