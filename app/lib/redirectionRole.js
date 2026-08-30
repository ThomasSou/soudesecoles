// Aiguillage après connexion : une seule page de connexion pour tous les
// rôles (parent, membre du bureau, enseignant / direction, partenaire), puis
// redirection vers l'espace correspondant.
//
// Utilisé par la route GET /api/moi/espace, elle-même appelée par
// app/connexion/page.js et app/activer-compte/page.js après une connexion
// réussie (signInWithPassword). Remplace l'ancienne route /api/roles.
//
// Décision D1 — un même compte auth.users peut être rattaché À LA FOIS à
// plusieurs fiches (ex. une directrice également parent d'élève, un partenaire
// aussi parent). L'ordre des tests ci-dessous EST la règle de priorité
// retenue :
//
//     bureau (parents.is_admin)
//   > enseignant / direction (teachers.active)
//   > partenaire (partenaires.auth_user_id)
//   > parent (défaut)
//
// Un compte qui coche plusieurs cases atterrit sur l'espace le plus « haut »
// et rejoint ses autres espaces par les liens dédiés (bouton « Back-office »
// dans /espace-adherent, liens de pied de page, etc.).

// Détermine l'espace d'accueil d'un compte à partir de son user id auth.
// Renvoie l'un de : "/admin", "/espace-enseignant", "/partenaire",
// "/espace-adherent".
export async function resoudreEspace(admin, authUserId) {
  if (!authUserId) return "/espace-adherent";

  // 1. Bureau — priorité absolue.
  const { data: parent } = await admin
    .from("parents")
    .select("is_admin")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (parent?.is_admin) return "/admin";

  // 2. Enseignant / direction actif.
  const { data: teacher } = await admin
    .from("teachers")
    .select("active")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (teacher?.active) return "/espace-enseignant";

  // 3. Partenaire — un compte rattaché à une fiche partenaire. La page
  //    /partenaire gère elle-même le cas d'une fiche désactivée.
  const { data: partenaire } = await admin
    .from("partenaires")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (partenaire?.id) return "/partenaire";

  // 4. Par défaut : espace famille.
  return "/espace-adherent";
}
