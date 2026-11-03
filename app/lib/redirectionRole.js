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
//     enseignant / direction (teachers.active)
//   > partenaire (partenaires.auth_user_id)
//   > parent, y compris les membres du bureau (défaut)
//
// Un membre du bureau arrive sur son espace famille, qui porte le lien
// « Back-office → » (choix de Thomas, nov. 2026 : à la connexion, le bureau
// était envoyé directement sur /admin et ne retrouvait plus sa page parent).
// Depuis /admin, un lien « Mon espace famille » permet de revenir.

// Détermine l'espace d'accueil d'un compte à partir de son user id auth.
// Renvoie l'un de : "/espace-enseignant", "/partenaire",
// "/espace-adherent".
export async function resoudreEspace(admin, authUserId) {
  if (!authUserId) return "/espace-adherent";

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
