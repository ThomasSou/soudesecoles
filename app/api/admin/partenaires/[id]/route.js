import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

const PERM = "avantages";

// GET : fiche complète d'un partenaire pour l'écran de détail du back-office
// (coordonnées, périodes, paiements, avantages + utilisations, historique
// des offres, documents).
export async function GET(request, { params }) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const { data: partenaire, error } = await admin
    .from("partenaires")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!partenaire) return NextResponse.json({ error: "Partenaire introuvable." }, { status: 404 });

  const [
    { data: periodes },
    { data: paiements },
    { data: avantages },
    { data: documents },
    { data: evenements },
  ] = await Promise.all([
    admin.from("partenaire_periodes").select("*").eq("partenaire_id", params.id).order("debut", { ascending: false }),
    admin.from("partenaire_paiements").select("*").eq("partenaire_id", params.id).order("recu_le", { ascending: false }),
    admin.from("avantages").select("*").eq("partenaire_id", params.id).order("created_at", { ascending: false }),
    admin.from("partenaire_documents").select("*").eq("partenaire_id", params.id).order("depose_le", { ascending: false }),
    admin.from("avantage_evenements").select("*").eq("partenaire_id", params.id).order("created_at", { ascending: false }).limit(200),
  ]);

  // Nombre d'utilisations (consommations familles) par avantage.
  const ids = (avantages || []).map((a) => a.id);
  let utilisationsParAvantage = {};
  if (ids.length) {
    const { data: utilisations } = await admin
      .from("avantage_utilisations")
      .select("avantage_id")
      .in("avantage_id", ids);
    for (const u of utilisations || []) {
      utilisationsParAvantage[u.avantage_id] = (utilisationsParAvantage[u.avantage_id] || 0) + 1;
    }
  }

  return NextResponse.json({
    ok: true,
    partenaire,
    periodes: periodes || [],
    paiements: paiements || [],
    avantages: (avantages || []).map((a) => ({ ...a, utilisations: utilisationsParAvantage[a.id] || 0 })),
    documents: documents || [],
    evenements: evenements || [],
  });
}

// PATCH : coordonnées, activation/désactivation, régénération du PIN comptoir.
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const update = {};

  const champs = {
    nom: "nom",
    contactNom: "contact_nom",
    telephone: "telephone",
    adresse: "adresse",
    codePostal: "code_postal",
    ville: "ville",
    siteWeb: "site_web",
    notes: "notes",
    slug: "slug",
  };
  for (const [cle, colonne] of Object.entries(champs)) {
    if (typeof body?.[cle] === "string") update[colonne] = body[cle].trim() || null;
  }
  if (typeof body?.email === "string") update.email = body.email.trim().toLowerCase() || null;
  if (typeof body?.active === "boolean") update.active = body.active;
  if (body?.regeneratePin) update.pin_code = String(Math.floor(1000 + Math.random() * 9000));

  if (update.nom === null) {
    return NextResponse.json({ error: "Le nom ne peut pas être vide." }, { status: 400 });
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  if (update.email) {
    const { data: doublon } = await auth.admin
      .from("partenaires")
      .select("id")
      .ilike("email", update.email)
      .neq("id", params.id)
      .maybeSingle();
    if (doublon) {
      return NextResponse.json({ error: "Un autre partenaire utilise déjà cette adresse." }, { status: 409 });
    }
  }

  const { data, error } = await auth.admin
    .from("partenaires")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, partenaire: data });
}
