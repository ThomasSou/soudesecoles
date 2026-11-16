import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { currentSchoolYear, isMembershipValid } from "../../../../lib/anneeScolaire";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Liste des commandes de la boutique, les plus récentes en premier.
export async function GET(request) {
  const auth = await requirePermission(request, "boutique");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // `erreur_paiement` (migration 0062) : raison du refus HelloAsso. Lecture
  // tolérante tant que la colonne n'existe pas.
  const colonnes =
    "id, items, total_cents, buyer_first_name, buyer_last_name, buyer_email, buyer_phone, status, created_at, paid_at, parent_id, family_id";
  const lire = (cols) =>
    auth.admin.from("shop_orders").select(cols).order("created_at", { ascending: false }).limit(300);
  let { data, error } = await lire(`${colonnes}, erreur_paiement`);
  if (error && /erreur_paiement/i.test(error.message)) ({ data, error } = await lire(colonnes));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // La boutique (donc la manifestation) d'une commande se déduit de ses
  // produits : chaque ligne garde l'identifiant du produit commandé, et chaque
  // produit appartient à une boutique. Pas de migration nécessaire.
  const { data: produits } = await auth.admin.from("shop_products").select("id, boutique_id");
  const boutiqueParProduit = Object.fromEntries((produits || []).map((p) => [p.id, p.boutique_id]));

  // Profil de l'acheteur : retrouvé dans la base par le compte connecté lors
  // de la commande (parent_id / family_id) ou, à défaut, par son adresse
  // e-mail comparée à celle des parents. « Parent d'élève » = la famille a au
  // moins un enfant scolarisé cette année ; « adhérent » = cotisation de
  // l'année payée.
  const annee = currentSchoolYear();
  const [{ data: parents }, { data: enfants }, { data: adhesions }] = await Promise.all([
    auth.admin.from("parents").select("id, family_id, email"),
    auth.admin.from("children").select("family_id").eq("school_year", annee),
    auth.admin.from("memberships").select("family_id, school_year, paid_at").eq("school_year", annee),
  ]);
  const familleParParent = Object.fromEntries((parents || []).map((p) => [p.id, p.family_id]));
  const familleParEmail = {};
  for (const p of parents || []) {
    if (p.email && p.family_id) familleParEmail[p.email.toLowerCase()] = p.family_id;
  }
  const famillesAvecEnfant = new Set((enfants || []).map((c) => c.family_id));
  const famillesAdherentes = new Set((adhesions || []).filter((m) => isMembershipValid(m)).map((m) => m.family_id));

  const profilDe = (o) => {
    const familleId =
      o.family_id || familleParParent[o.parent_id] || familleParEmail[(o.buyer_email || "").toLowerCase()] || null;
    if (!familleId) return "inconnu"; // adresse non reconnue : pas dans la base des familles
    if (!famillesAvecEnfant.has(familleId)) return "sans_enfant"; // famille connue, aucun enfant cette année
    return famillesAdherentes.has(familleId) ? "parent_adherent" : "parent_non_adherent";
  };

  const orders = (data || []).map((o) => ({
    ...o,
    profil: profilDe(o),
    parent_id: undefined,
    family_id: undefined,
    boutiqueIds: [
      ...new Set((o.items || []).map((it) => boutiqueParProduit[it.productId]).filter(Boolean)),
    ],
  }));
  return NextResponse.json({ ok: true, orders });
}
