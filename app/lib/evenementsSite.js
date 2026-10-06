import { createAdminClient } from "./supabaseServerAdmin";
import { EVENTS } from "../evenements/data";

// Événements du calendrier public (accueil + /evenements), gérés depuis le
// back-office (table site_evenements). Tant que la table n'existe pas (la
// migration n'est pas passée), on retombe sur la liste figée de
// app/evenements/data.js : le site continue de marcher. Une table qui existe
// mais ne contient aucun événement visible renvoie bien une liste vide.
export async function chargerEvenements() {
  try {
    const { data, error } = await createAdminClient()
      .from("site_evenements")
      .select("*")
      .eq("visible", true);
    if (error) return EVENTS;
    return (data || []).map((e) => ({
      slug: e.slug,
      name: e.name,
      date: e.date_debut,
      endDate: e.date_fin || undefined,
      place: e.lieu || "",
      desc: e.description || "",
      image: e.image_url || undefined,
      hasPage: Boolean(e.page_dediee),
    }));
  } catch {
    return EVENTS;
  }
}
