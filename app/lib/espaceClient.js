// Helper client : après une connexion réussie, demande au serveur vers quel
// espace envoyer l'utilisateur (bureau > enseignant > partenaire > parent).
// Utilisé par app/connexion/page.js et app/activer-compte/page.js.
//
// Tolérant aux pannes : si la route ne répond pas (réseau, 500, migration
// pas encore appliquée...), on retombe sur l'espace famille, qui est le
// comportement historique.
export async function espaceApresConnexion(accessToken, repli = "/espace-adherent") {
  if (!accessToken) return repli;
  try {
    const res = await fetch("/api/moi/espace", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return repli;
    const data = await res.json();
    return data?.redirect || repli;
  } catch {
    return repli;
  }
}
