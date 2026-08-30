import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";

export const dynamic = "force-dynamic";

const PERM = "partenaires";
const NIVEAUX = ["or", "argent", "bronze"];

// GET : les 3 niveaux de partenariat avec leurs contreparties et quotas.
// PATCH : met à jour un niveau (quota_email, quota_reseau, quota_avantages,
// contreparties, libelle). Les 3 lignes sont créées par la migration 0034 ;
// cette route ne fait que les modifier.
export async function GET(request) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("niveaux_partenaire")
    .select("*")
    .order("ordre");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, niveaux: data || [] });
}

export async function PATCH(request) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const niveau = body?.niveau;
  if (!NIVEAUX.includes(niveau)) {
    return NextResponse.json({ error: "Niveau inconnu." }, { status: 400 });
  }

  const update = { updated_at: new Date().toISOString(), updated_by: auth.parent.id };
  for (const champ of ["quota_email", "quota_reseau", "quota_avantages"]) {
    if (body[champ] !== undefined) {
      const v = body[champ];
      update[champ] = v === null || v === "" ? (champ === "quota_avantages" ? null : 0) : Math.max(0, Math.round(Number(v)));
    }
  }
  if (typeof body?.libelle === "string" && body.libelle.trim()) update.libelle = body.libelle.trim();
  if (typeof body?.contreparties === "string") update.contreparties = body.contreparties.trim() || null;

  const { data, error } = await auth.admin
    .from("niveaux_partenaire")
    .update(update)
    .eq("niveau", niveau)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, niveau: data });
}
