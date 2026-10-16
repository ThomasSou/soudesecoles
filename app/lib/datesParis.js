// Dates « à la française » : les tâches planifiées tournent en UTC, mais les
// règles du Sou (rappel le 22, message à envoyer avant le 28…) se comptent en
// jours de l'heure de Paris.

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const pad = (n) => String(n).padStart(2, "0");

// Jour courant à Paris : { iso: "2026-10-16", y, m, d }.
export function jourParis(date = new Date()) {
  const iso = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const [y, m, d] = iso.split("-").map(Number);
  return { iso, y, m, d };
}

// « 2026-11 » + n mois.
export function ajouterMois(aaaamm, n) {
  const [y, m] = aaaamm.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

// « 2026-11-28 » + n jours.
export function ajouterJours(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Nombre de jours entiers de a à b (b - a), au format AAAA-MM-JJ.
export function joursEntre(a, b) {
  return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
}

// « 2026-11 » -> « novembre 2026 ».
export function moisLibelle(aaaamm) {
  const [y, m] = aaaamm.split("-").map(Number);
  return `${MOIS[m - 1]} ${y}`;
}

// « 2026-11 » -> « novembre » (sans l'année).
export function nomDuMois(aaaamm) {
  return MOIS[Number(aaaamm.split("-")[1]) - 1];
}

// « 2026-11-28 » -> « samedi 28 novembre 2026 ».
export function dateLongue(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Dernier jour pour envoyer un message « nouveautés » : le 28 de chaque mois.
export const JOUR_LIMITE_MESSAGE = 28;

// Mois de PARUTION visé par un message déposé aujourd'hui. L'e-mail aux
// familles part le 1er de chaque mois ; un message reçu jusqu'au 28 paraît le
// 1er du mois suivant, un message plus tardif attend le mois d'après.
export function moisParution(date = new Date()) {
  const j = jourParis(date);
  return ajouterMois(`${j.y}-${pad(j.m)}`, j.d <= JOUR_LIMITE_MESSAGE ? 1 : 2);
}
