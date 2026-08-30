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
//
// Décision D1 — un même compte auth.users peut être rattaché À LA FOIS à une
// fiche `parents` et à une fiche `teachers` (ex. une directrice également
// parent d'élève). L'ordre des tests ci-dessous EST la règle de priorité
// retenue :  bureau  >  enseignant / direction  >  parent.
// Un compte qui coche plusieurs cases atterrit sur l'espace le plus « haut »,
// et garde des liens pour rejoindre ses autres espaces (bouton « Back-office »
// déjà présent dans /espace-adherent ; à prévoir « Mon espace famille » et
// « Espace enseignant » là où c'est utile — point d'intégration partagé).

// Détermine l'espace d'accueil d'un compte à partir de son user id auth.
// Renvoie l'un de : "/admin", "/espace-enseignant", "/espace-adherent".
export async function resoudreEspace(admin, authUserId) {
  if (!authUserId) return "/espace-adherent";

  // 1. Bureau — priorité absolue. Un membre du bureau qui est aussi parent
  //    (ou enseignant) atterrit sur le back-office ; il ouvre ses autres
  //    espaces depuis les liens dédiés.
  const { data: parent } = await admin
    .from("parents")
    .select("is_admin")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (parent?.is_admin) return "/admin";

  // 2. Enseignant / direction actif — avant l'espace famille : un compte qui
  //    est les deux voit d'abord l'espace enseignant.
  const { data: teacher } = await admin
    .from("teachers")
    .select("active")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (teacher?.active) return "/espace-enseignant";

  // 3. Par défaut : espace famille.
  return "/espace-adherent";
}
