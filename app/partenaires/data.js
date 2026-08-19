// Répartition déduite des montants de partenariat connus (Barrels 1000€, puis 500€, puis 250€).
// À confirmer/ajuster par Thomas si besoin.
//
// Les champs description/address/phone/email/website ont été rédigés à partir
// d'une recherche web (sites officiels, pages jaunes, mairie de Montmerle).
// Contenu à valider individuellement avec chaque partenaire avant publication
// definitive (cf. echange avec Thomas du 19/08/2026).
export const PARTNERS = [
  {
    slug: "barrels",
    name: "Barrels",
    file: "barrels.png",
    tier: "Gold",
    description:
      "Métallerie haut de gamme fondée en 2018 par Thibaut et Aurélia. L'atelier conçoit et fabrique sur mesure garde-corps, verrières, escaliers métalliques et mobilier en acier, inox, laiton ou aluminium.",
    address: "181 chemin des Vernailles, 69830 Saint-Georges-de-Reneins",
    website: "https://www.barrels-metal.fr/",
  },
  {
    slug: "diennet",
    name: "Diennet",
    file: "diennet.jpg",
    tier: "Silver",
    description:
      "Maison familiale de charcuterie fondée en 1898 à Montmerle, aujourd'hui dirigée par Jérôme Diennet. Jambons, saucissons et terrines sont fabriqués selon des recettes transmises de génération en génération.",
    address: "Marché couvert, 01090 Montmerle-sur-Saône",
    website: "http://www.charcuterie-diennet.fr/",
  },
  {
    slug: "nicod",
    name: "Nicod",
    file: "nicod.jpg",
    tier: "Silver",
    description:
      "Boucherie-charcuterie-traiteur-pâtisserie tenue par la famille Nicod depuis 1967. Nicod Traiteur accompagne réceptions, cocktails et mariages dans le Beaujolais et le Val de Saône.",
    address: "6 rue de Mâcon, 01090 Montmerle-sur-Saône",
    phone: "04 74 69 33 62",
    email: "contact@nicodtraiteur.fr",
    website: "https://www.nicodtraiteur.fr/",
  },
  {
    slug: "spar",
    name: "SPAR",
    file: "spar.jpg",
    tier: "Silver",
    description:
      "Supermarché de proximité au cœur de Montmerle-sur-Saône, avec un large choix de produits frais, bio et régionaux.",
    address: "4 rue du Marché, 01090 Montmerle-sur-Saône",
    phone: "04 37 55 71 41",
  },
  {
    slug: "millesime",
    name: "Millésimes et Cuvées",
    file: "millesime.jpg",
    tier: "Bronze",
    description:
      "Caviste indépendant tenu par Stéphane : vins en vrac et en bouteille, bières, whiskies, rhums et spiritueux. Une salle de réception accueille des soirées dégustation mensuelles, avec terrasse ouverte l'été.",
    address: "27 rue de Lyon, 01090 Montmerle-sur-Saône",
    email: "millesimesetcuvees@orange.fr",
  },
  {
    slug: "emilejob",
    name: "Emile Job",
    file: "emilejob.jpg",
    tier: "Bronze",
    description:
      "Restaurant familial tenu par Eric et Isabelle Lépine depuis trois générations, au bord de la Saône. Cuisine traditionnelle (volaille de Bresse, grenouilles, poissons de rivière) et terrasse ombragée par des tilleuls centenaires.",
    address: "12 rue du Pont, 01090 Montmerle-sur-Saône",
    phone: "04 74 69 33 92",
    email: "contact@restaurantemilejob.com",
    website: "https://www.restaurantemilejob.com/",
  },
  {
    slug: "maitresdeboucheurs",
    name: "Les Maîtres Déboucheurs",
    file: "maitresdeboucheurs.jpg",
    tier: "Bronze",
    description:
      "Spécialistes du débouchage de canalisations, du curage et du nettoyage haute pression, intervenant notamment sur le secteur Beaujolais - Val de Saône.",
    website: "https://www.maitres-deboucheurs.com/",
  },
  {
    slug: "flandin",
    name: "Flandin Opticien",
    file: "flandin.jpg",
    tier: "Bronze",
    description:
      "Opticien de proximité à Montmerle-sur-Saône depuis 2012 : lunettes de vue et de soleil, lentilles, réparations et ajustages, conseil personnalisé.",
    address: "18 rue de Lyon, 01090 Montmerle-sur-Saône",
    phone: "04 74 69 44 19",
    email: "flandin.opticien@orange.fr",
  },
];

export const TIER_ORDER = ["Gold", "Silver", "Bronze"];

export const TIER_STYLES = {
  Gold: { imgBox: "h-32 sm:h-40", card: "sm:col-span-2", title: "text-lg" },
  Silver: { imgBox: "h-24", card: "", title: "text-base" },
  Bronze: { imgBox: "h-16", card: "", title: "text-sm" },
};
