// Tâche planifiée Netlify : chaque matin, demande au site d'envoyer le
// récapitulatif de ce qui attend le bureau (messages, devis et factures
// d'enseignants, demandes...). Le site n'envoie rien s'il n'y a rien à traiter.
// 6 h UTC = 7 h (hiver) ou 8 h (été) à Paris.
export default async () => {
  const site = process.env.URL || "https://sou-montmerle.fr";
  try {
    const res = await fetch(`${site}/api/admin/alertes/recap`, {
      method: "POST",
      headers: { "x-admin-token": process.env.ADMIN_IMPORT_TOKEN || "" },
    });
    console.log("[recap-quotidien]", res.status, await res.text());
  } catch (e) {
    console.error("[recap-quotidien] échec :", e.message);
  }
};

export const config = { schedule: "0 6 * * *" };
