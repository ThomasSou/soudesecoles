// Répartition déduite des montants de partenariat connus (Barrels 1000€, puis 500€, puis 250€).
// À confirmer/ajuster par Thomas si besoin.
export const PARTNERS = [
  { slug: "barrels", name: "Barrels", file: "barrels.png", tier: "Gold" },
  { slug: "diennet", name: "Diennet", file: "diennet.jpg", tier: "Silver" },
  { slug: "nicod", name: "Nicod", file: "nicod.jpg", tier: "Silver" },
  { slug: "spar", name: "SPAR", file: "spar.jpg", tier: "Silver" },
  { slug: "millesime", name: "Millésimes et Cuvées", file: "millesime.jpg", tier: "Bronze" },
  { slug: "emilejob", name: "Emile Job", file: "emilejob.jpg", tier: "Bronze" },
];

export const TIER_ORDER = ["Gold", "Silver", "Bronze"];

export const TIER_STYLES = {
  Gold: { imgBox: "h-32 sm:h-40", card: "sm:col-span-2", title: "text-lg" },
  Silver: { imgBox: "h-24", card: "", title: "text-base" },
  Bronze: { imgBox: "h-16", card: "", title: "text-sm" },
};
