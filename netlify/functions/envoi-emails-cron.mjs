// Tâche planifiée Netlify : toutes les 10 minutes, relance l'envoi des
// campagnes e-mail restées « en_cours » (cf. /admin/emails), même si plus
// personne n'a la page ouverte dans un navigateur.
//
// Un simple déclencheur : l'envoi lui-même tourne dans la fonction de fond
// envoi-emails-background (jusqu'à 15 minutes, contre 30 secondes ici).
// Remplace le workflow GitHub Actions « continuer-envois-email » : GitHub ne
// déclenchait les tâches planifiées que toutes les 3 à 6 heures au lieu de
// toutes les 5 minutes (observé du 29/09 au 06/10/2026), ce qui laissait les
// envois bloqués la nuit.
export default async () => {
  const site = process.env.URL || "https://sou-montmerle.fr";
  try {
    const res = await fetch(`${site}/.netlify/functions/envoi-emails-background`, {
      method: "POST",
      headers: { "x-admin-token": process.env.ADMIN_IMPORT_TOKEN || "" },
    });
    console.log("[envoi-emails-cron] déclenchement :", res.status);
  } catch (e) {
    console.error("[envoi-emails-cron] échec du déclenchement :", e.message);
  }
};

export const config = { schedule: "*/10 * * * *" };
