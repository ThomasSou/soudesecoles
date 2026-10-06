import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { quantitesVendues } from "../../../lib/boutiqueOptions";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Catalogue public de la boutique — ouvert à tout visiteur, pas seulement
// aux familles adhérentes. Chaque produit est rattaché à une boutique
// (Foire, Marché de Noël...) : seuls les produits d'une boutique encore
// ouverte (active, et date de fermeture non dépassée) sont renvoyés.
export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shop_products")
    // select("*") : continue de marcher avant la migration 0052, qui ajoute
    // max_quantity et options.
    .select("*, boutiques(id, name, description, active, date_fermeture, position)")
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

  // Stock restant pour les produits à quantité limitée.
  let vendues = {};
  if (produitsOuverts.some((p) => p.max_quantity != null)) {
    vendues = await quantitesVendues(admin);
  }
  const products = produitsOuverts.map((p) => ({
    ...p,
    options: Array.isArray(p.options) ? p.options : [],
    remaining:
      p.max_quantity != null ? Math.max(0, p.max_quantity - (vendues[p.id] || 0)) : null,
  }));

  return NextResponse.json({ ok: true, products });
}
