import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Permission utilisée pour tout le module partenaires. À SCINDER plus tard en
// une permission dédiée "partenaires" (une ligne à ajouter dans le tableau
// PERMISSIONS de app/lib/adminAuth.js), cf. docs/conception-espace-partenaires.md.
const PERM = "avantages";

function genererPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// GET : liste des partenaires avec, pour chacun, le nombre d'avantages, la
// période d'adhésion courante et le total encaissé.
// POST : création d'un partenaire (coordonnées complètes ; PIN de comptoir
// généré d'office ; l'invitation e-mail se déclenche séparément via
// /api/admin/partenaires/[id]/inviter).
export async function GET(request) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: partenaires, error }, { data: avantages }, { data: periodes }, { data: paiements }] =
    await Promise.all([
      auth.admin.from("partenaires").select("*").order("created_at", { ascending: false }),
      auth.admin.from("avantages").select("partenaire_id").eq("type", "partenaire"),
      auth.admin.from("partenaire_periodes").select("partenaire_id, debut, fin, annulee"),
      auth.admin.from("partenaire_paiements").select("partenaire_id, montant_cents"),
    ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const aujourdHui = new Date().toISOString().slice(0, 10);
  const nbAvantages = {};
  for (const a of avantages || []) {
    if (a.partenaire_id) nbAvantages[a.partenaire_id] = (nbAvantages[a.partenaire_id] || 0) + 1;
  }
  const aJour = {};
  for (const p of periodes || []) {
    if (!p.annulee && p.debut <= aujourdHui && p.fin >= aujourdHui) aJour[p.partenaire_id] = true;
  }
  const totalEncaisse = {};
  for (const p of paiements || []) {
    totalEncaisse[p.partenaire_id] = (totalEncaisse[p.partenaire_id] || 0) + p.montant_cents;
  }

  return NextResponse.json({
    ok: true,
    partenaires: (partenaires || []).map((p) => ({
      ...p,
      avantages: nbAvantages[p.id] || 0,
      aJour: Boolean(aJour[p.id]),
      totalEncaisseCents: totalEncaisse[p.id] || 0,
      compteActif: Boolean(p.auth_user_id),
    })),
  });
}

export async function POST(request) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const nom = body?.nom?.trim();
  if (!nom) return NextResponse.json({ error: "Le nom du partenaire est obligatoire." }, { status: 400 });

  const email = body?.email?.trim() || null;
  if (email) {
    const { data: doublon } = await auth.admin
      .from("partenaires")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (doublon) {
      return NextResponse.json({ error: "Un partenaire utilise déjà cette adresse e-mail." }, { status: 409 });
    }
  }

  const { data, error } = await auth.admin
    .from("partenaires")
    .insert({
      nom,
      email,
      contact_nom: body?.contactNom?.trim() || null,
      telephone: body?.telephone?.trim() || null,
      adresse: body?.adresse?.trim() || null,
      code_postal: body?.codePostal?.trim() || null,
      ville: body?.ville?.trim() || null,
      site_web: body?.siteWeb?.trim() || null,
      notes: body?.notes?.trim() || null,
      slug: body?.slug?.trim() || null,
      pin_code: genererPin(),
      active: true,
      created_by: auth.parent.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    partenaire: { ...data, avantages: 0, aJour: false, totalEncaisseCents: 0, compteActif: false },
  });
}
