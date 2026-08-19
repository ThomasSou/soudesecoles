// L'année scolaire du Sou court du 1er septembre au 31 août.
// Une adhésion prise pour "2025-2026" est donc valide jusqu'au 31/08/2026
// inclus, et expire automatiquement le 1er septembre.

export function currentSchoolYear(date = new Date()) {
  const year = date.getFullYear();
  // Les mois sont indexés à partir de 0 : août = 7, septembre = 8.
  const startYear = date.getMonth() >= 8 ? year : year - 1;
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
