// L'année scolaire du Sou bascule fin août, au moment de la rentrée : à
// partir du 26 août, on est déjà dans la nouvelle année scolaire, et les
// familles peuvent adhérer pour l'année qui commence. Une adhésion prise
// pour "2026-2027" est donc valide jusqu'à la bascule suivante (fin août
// 2027).

export function currentSchoolYear(date = new Date()) {
  const year = date.getFullYear();
  // Les mois sont indexés à partir de 0 : août = 7, septembre = 8.
  const month = date.getMonth();
  const nouvelleAnnee = month > 7 || (month === 7 && date.getDate() >= 26);
  const startYear = nouvelleAnnee ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

// Date de fin (dernier jour inclus) d'une année scolaire "YYYY-YYYY".
export function schoolYearEnd(schoolYear) {
  const endYear = Number(schoolYear.split("-")[1]);
  return new Date(endYear, 7, 31, 23, 59, 59); // 31 août
}

// Une adhésion est valide si elle est payée et porte sur l'année en cours.
export function isMembershipValid(membership, date = new Date()) {
  if (!membership || !membership.paid_at) return false;
  return membership.school_year === currentSchoolYear(date);
}

export function findCurrentMembership(memberships, date = new Date()) {
  const year = currentSchoolYear(date);
  return (memberships || []).find((m) => m.school_year === year) || null;
}
