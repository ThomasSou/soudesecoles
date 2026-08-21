import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

// Catalogue public de la boutique — ouvert à tout visiteur, pas seulement
// aux familles adhérentes. Chaque produit est rattaché à une boutique
// (Foire, Marché de Noël...) : seuls les produits d'une boutique encore
// ouverte (active, et date de fermeture non dépassée) sont renvoyés.
export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shop_products")
    .select(
      "id, slug, name, description, price_cents, image_url, category, boutique_id, boutiques(id, name, description, active, date_fermeture, position)"
    )
    .eq("active", true)
    .order("category")
    .order("position")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const maintenant = new Date();
  const produitsOuverts = (data || []).filter((p) => {
    const boutique = p.boutiques;
    if (!boutique || !boutique.active) return false;
    if (boutique.date_fermeture && new Date(boutique.date_fermeture) < maintenant) return false;
    return true;
  });

  return NextResponse.json({ ok: true, products: produitsOuverts });
}
