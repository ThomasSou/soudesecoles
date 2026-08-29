// Aiguillage après connexion : une seule page de connexion pour tous les
// rôles (parent, membre du bureau, enseignant / direction), puis redirection
// vers l'espace correspondant.
//
// POINT D'INTÉGRATION (à brancher le matin, cf.
// docs/conception-espace-enseignants.md) :
//   - app/connexion/page.js       : après signInWithPassword réussi, appeler
//                                   /api/moi/espace puis router.push(cible).
//   - app/activer-compte/page.js  : idem après activation + signIn.
//   - le middleware / les gardes de page peuvent réutiliser resoudreEspace().
//
// Ni la page de connexion ni adminAuth.js ne sont modifiés dans cette
// livraison : ce module est fourni prêt à l'emploi, le branchement est une
// décision du matin.

// Détermine l'espace d'accueil d'un compte à partir de son user id auth.
// Renvoie l'un de : "/admin", "/espace-enseignant", "/espace-adherent".
export async function resoudreEspace(admin, authUserId) {
  if (!authUserId) return "/espace-adherent";

  // Priorité au bureau : un membre du bureau qui est aussi parent atterrit
  // sur le back-office (il peut toujours ouvrir son espace famille depuis là).
  const { data: parent } = await admin
    .from("parents")
    .select("is_admin")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (parent?.is_admin) return "/admin";

  const { data: teacher } = await admin
    .from("teachers")
    .select("active")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (teacher?.active) return "/espace-enseignant";

  return "/espace-adherent";
}
