// Tâche planifiée Netlify : une fois par jour (5 h UTC, soit 6 h ou 7 h à
// Paris selon la saison), lance les e-mails automatiques vers les partenaires et
// l'e-mail mensuel aux familles. La route décide seule quoi envoyer selon la
// date (rappel le 22, table avant un événement, e-mail du 1er du mois) et
// n'envoie jamais deux fois la même chose : cf. app/lib/partenairesAuto.js.
export default async () => {
  const site = process.env.URL || "https://sou-montmerle.fr";
  try {
    const res = await fetch(`${site}/api/admin/partenaires-auto`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": process.env.ADMIN_IMPORT_TOKEN || "" },
      body: "{}",
    });
    const d = await res.json().catch(() => ({}));
    console.log("[partenaires-auto-cron]", res.status, JSON.stringify(d));
  } catch (e) {
    console.error("[partenaires-auto-cron] échec :", e.message);
  }
};

export const config = { schedule: "0 5 * * *" };
