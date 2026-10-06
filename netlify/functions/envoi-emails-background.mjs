// Fonction de fond Netlify (le suffixe « -background » du nom de fichier lui
// donne jusqu'à 15 minutes d'exécution) : fait avancer par vagues toutes les
// campagnes e-mail « en_cours », en appelant la même route que l'éditeur
// (/api/admin/emails/continuer) avec le jeton de service. Le verrou par
// campagne côté serveur empêche tout doublon si un onglet est aussi ouvert.
//
// S'arrête dès qu'il n'y a plus rien à envoyer, ou avant la limite de 15 min
// (le prochain déclenchement de envoi-emails-cron prend alors le relais).
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

export default async (req) => {
  const jeton = process.env.ADMIN_IMPORT_TOKEN;
  if (!jeton || req.headers.get("x-admin-token") !== jeton) {
    console.error("[envoi-emails] appel non autorisé");
    return;
  }

  const site = process.env.URL || "https://sou-montmerle.fr";
  const debut = Date.now();
  const BUDGET_MS = 13 * 60 * 1000;
  let vagues = 0;

  while (Date.now() - debut < BUDGET_MS) {
    let data;
    try {
      const res = await fetch(`${site}/api/admin/emails/continuer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": jeton },
        body: "{}",
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[envoi-emails] erreur", res.status, data.error || "");
        // Erreur d'autorisation ou de config : inutile d'insister.
        if (res.status === 401 || res.status === 403 || res.status === 503) return;
        await attendre(10000);
        continue;
      }
    } catch (e) {
      console.error("[envoi-emails] appel impossible :", e.message);
      await attendre(10000);
      continue;
    }

    const campagnes = data.campagnes || [];
    const restantes = campagnes.filter((c) => !c.done);
    vagues += 1;
    if (restantes.length === 0) {
      console.log(`[envoi-emails] terminé après ${vagues} appel(s).`);
      return;
    }
    // Une vague = 2 e-mails ; le verrou serveur impose ~20 s entre deux vagues.
    await attendre(20000);
  }
  console.log("[envoi-emails] budget de temps atteint, le prochain déclenchement reprendra.");
};
