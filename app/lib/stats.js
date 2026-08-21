import { createAdminClient } from "./supabaseServerAdmin";

// Incrémente un compteur de fréquentation.
//
// Volontairement écrit sans fonction SQL dédiée : la logique reste ici, dans
// le code versionné, ce qui évite d'avoir à maintenir du code stocké en base.
// Un compteur perdu (en cas de deux écritures simultanées sur la même ligne)
// est sans conséquence à notre échelle : on cherche des ordres de grandeur,
// pas une comptabilité au clic près.
export async function incrementerStat(kind, target) {
  if (!kind || !target) return;

  try {
    const admin = createAdminClient();
    const jour = new Date().toISOString().slice(0, 10);
    const cible = String(target).slice(0, 500);

    const { data: existant } = await admin
      .from("stats_daily")
      .select("id, count")
      .eq("day", jour)
      .eq("kind", kind)
      .eq("target", cible)
      .maybeSingle();

    if (existant) {
      await admin
        .from("stats_daily")
        .update({ count: existant.count + 1 })
        .eq("id", existant.id);
    } else {
      await admin
        .from("stats_daily")
        .insert({ day: jour, kind, target: cible, count: 1 });
    }
  } catch {
    // Une statistique n'est jamais assez importante pour casser une page.
  }
}
