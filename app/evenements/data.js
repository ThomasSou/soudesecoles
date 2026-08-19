// Dates officielles saison 2026-2027 (fiche de demande de créneaux, Mairie de
// Montmerle-sur-Saône), avec les modifications communiquées par le bureau.
// Le tri et le statut sont calculés automatiquement : les manifestations à
// venir apparaissent en premier, dans l'ordre chronologique ; celles déjà
// passées basculent en fin de liste.

export const EVENTS = [
  {
    slug: "foire",
    name: "Foire",
    date: "2026-09-04",
    endDate: "2026-09-05",
    place: "Bords de Saône, Montmerle-sur-Saône",
    desc: "Deux jours de fête : banquet gallo-romain, feu d'artifice, foire commerciale et spectacles équestres médiévaux.",
    image: "/evenements/foire.jpg",
    hasPage: true,
  },
  {
    slug: "marche-de-noel",
    name: "Marché de Noël",
    date: "2026-11-28",
    place: "Place du marché",
    desc: "Marché artisanal et animations pour les familles, de 10h30 à 20h30.",
  },
  {
    slug: "loto",
    name: "Loto",
    date: "2027-01-31",
    place: "Salle des fêtes",
    desc: "Une après-midi conviviale et de nombreux lots à gagner, de 12h à 18h30.",
  },
  {
    slug: "vide-greniers",
    name: "Vide-greniers",
    date: "2027-05-16",
    place: "Site des Mûriers",
    desc: "Brocante ouverte à tous, exposants et visiteurs, de 4h à 18h.",
  },
  {
    slug: "montmerle-part-en-live",
    name: "Montmerle part en Live",
    date: "2027-06-06",
    place: "Parc de la Batellerie",
    desc: "Événement musical grand public : DJ sets, food et cocktails.",
  },
  {
    slug: "fete-de-l-ecole",
    name: "Fête de l'école",
    date: "2027-06-25",
    place: "Site des Mûriers",
    desc: "La fête de fin d'année, moment fort pour les enfants, de 16h à 21h.",
  },
];

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MOIS[m - 1]} ${y}`;
}

// Affiche "4 et 5 septembre 2026" pour un événement sur deux jours.
export function formatEventDates(event) {
  if (!event.endDate) return formatDate(event.date);
  const [, m1, d1] = event.date.split("-").map(Number);
  const [y2, m2, d2] = event.endDate.split("-").map(Number);
  if (m1 === m2) return `${d1} et ${d2} ${MOIS[m2 - 1]} ${y2}`;
  return `${d1} ${MOIS[m1 - 1]} — ${d2} ${MOIS[m2 - 1]} ${y2}`;
}

export function isUpcoming(event) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(event.endDate || event.date) >= today;
}

// Les manifestations à venir d'abord (de la plus proche à la plus lointaine),
// puis les passées (de la plus récente à la plus ancienne).
export function sortEvents(events) {
  const upcoming = events
    .filter(isUpcoming)
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = events
    .filter((e) => !isUpcoming(e))
    .sort((a, b) => b.date.localeCompare(a.date));
  return [...upcoming, ...past];
}

export function getEvent(slug) {
  return EVENTS.find((e) => e.slug === slug);
}
