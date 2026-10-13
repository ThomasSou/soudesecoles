import { createAdminClient } from "./supabaseServerAdmin";
import { EVENTS } from "../evenements/data";

// Événements qui ont une page dédiée écrite dans le code (/evenements/<slug>).
// Une manifestation y figure dès que sa page existe, sans autre réglage.
const PAGES_DEDIEES = new Set(["foire", "marche-de-noel"]);

// Image de la carte quand l'événement n'en a pas encore enregistré dans le
// back-office (une image téléversée depuis l'onglet Événements la remplace).
const IMAGES_PAR_DEFAUT = {
  foire: "/evenements/foire.jpg",
  "marche-de-noel": "/evenements/marche-de-noel.jpg",
};

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
      image: e.image_url || IMAGES_PAR_DEFAUT[e.slug] || undefined,
      hasPage: Boolean(e.page_dediee) || PAGES_DEDIEES.has(e.slug),
    }));
  } catch {
    return EVENTS;
  }
}
