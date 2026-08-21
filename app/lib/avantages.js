import { currentSchoolYear } from "./anneeScolaire";

// Retrouve la famille correspondant au jeton de carte (memberships.qr_code_token)
// et indique si son adhésion est à jour pour l'année en cours. Utilisé par
// les routes de validation d'avantage, côté bureau comme côté partenaire.
export async function resolveFamilleParToken(admin, token) {
  const { data: membership } = await admin
    .from("memberships")
    .select("family_id, school_year, paid_at")
    .eq("qr_code_token", token)
    .maybeSingle();

  if (!membership) return { familyId: null, adhesionValide: false };

  const adhesionValide =
    !!membership.paid_at && membership.school_year === currentSchoolYear();

  return { familyId: membership.family_id, adhesionValide };
}
