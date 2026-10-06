import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function slugify(nom) {
  return (nom || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Valide les champs d'un événement ; renvoie { champs } ou { error }.
function lireChamps(body, { creation }) {
  const champs = {};
  if (creation || body?.name !== undefined) {
    const name = String(body?.name || "").trim();
    if (!name) return { error: "Le nom est obligatoire." };
    champs.name = name;
  }
  if (creation || body?.dateDebut !== undefined) {
    if (!ISO.test(body?.dateDebut || "")) return { error: "La date de début est obligatoire." };
    champs.date_debut = body.dateDebut;
  }
  if (body?.dateFin !== undefined) {
    if (body.dateFin && !ISO.test(body.dateFin)) return { error: "Date de fin invalide." };
    champs.date_fin = body.dateFin || null;
  }
  const debut = champs.date_debut || body?.dateDebutActuelle;
  if (champs.date_fin && debut && champs.date_fin < debut) {
    return { error: "La date de fin est avant la date de début." };
  }
  if (body?.lieu !== undefined) champs.lieu = String(body.lieu || "").trim() || null;
  if (body?.description !== undefined) champs.description = String(body.description || "").trim() || null;
  if (body?.imageUrl !== undefined) champs.image_url = body.imageUrl || null;
  if (body?.visible !== undefined) champs.visible = Boolean(body.visible);
  return { champs };
}

export async function GET(request) {
  const auth = await requirePermission(request, "evenements");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("site_evenements")
    .select("*")
    .order("date_debut", { ascending: true });
  if (error) {
    return NextResponse.json(
      { error: "Table des événements absente : la migration n'a pas encore été lancée.", details: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, evenements: data || [] });
}

export async function POST(request) {
  const auth = await requirePermission(request, "evenements");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const { champs, error } = lireChamps(body, { creation: true });
  if (error) return NextResponse.json({ error }, { status: 400 });

  // Identifiant d'adresse unique dérivé du nom (le suffixe évite les doublons).
  const base = slugify(champs.name) || "evenement";
  const { data: existants } = await auth.admin
    .from("site_evenements")
    .select("slug")
    .like("slug", `${base}%`);
  const pris = new Set((existants || []).map((e) => e.slug));
  let slug = base;
  for (let i = 2; pris.has(slug); i += 1) slug = `${base}-${i}`;

  const { data, error: eInsert } = await auth.admin
    .from("site_evenements")
    .insert({ ...champs, slug })
    .select()
    .single();
  if (eInsert) return NextResponse.json({ error: eInsert.message }, { status: 500 });
  return NextResponse.json({ ok: true, evenement: data });
}

export async function PATCH(request) {
  const auth = await requirePermission(request, "evenements");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  const { champs, error } = lireChamps(body, { creation: false });
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (Object.keys(champs).length === 0) {
    return NextResponse.json({ error: "Rien à modifier." }, { status: 400 });
  }

  const { data, error: eMaj } = await auth.admin
    .from("site_evenements")
    .update(champs)
    .eq("id", body.id)
    .select()
    .single();
  if (eMaj) return NextResponse.json({ error: eMaj.message }, { status: 500 });
  return NextResponse.json({ ok: true, evenement: data });
}

export async function DELETE(request) {
  const auth = await requirePermission(request, "evenements");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  const { error } = await auth.admin.from("site_evenements").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
