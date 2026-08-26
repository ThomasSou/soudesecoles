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

// Vérifie qu'un couple (partenaireId, pin) correspond bien à un compte
// partenaire actif. Utilisé par toutes les routes de l'espace partenaire :
// le PIN est le seul rempart, revérifié à chaque appel (pas de session
// serveur).
export async function resolvePartenaire(admin, partenaireId, pin) {
  const { data: partenaire } = await admin
    .from("partenaires")
    .select("id, nom, active")
    .eq("id", partenaireId)
    .eq("pin_code", pin)
    .maybeSingle();

  if (!partenaire || !partenaire.active) return null;
  return partenaire;
}
