import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";
import { appliquerPointage } from "../../../../../lib/comptaPointage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Actions sur une opération du relevé :
//   { action: "pointer", ligneId }  rapproche l'opération d'une ligne de compta
//   { action: "ignorer", note }     l'écarte de la compta (virement interne...)
//   { action: "rouvrir" }           annule un pointage ou une mise à l'écart
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, "comptabilite");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const { data: op, error: eLecture } = await auth.admin
    .from("compta_operations")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (eLecture) return NextResponse.json({ error: eLecture.message }, { status: 500 });
  if (!op) return NextResponse.json({ error: "Opération introuvable." }, { status: 404 });

  if (body.action === "pointer") {
    if (op.statut === "pointee" && op.ligne_id) {
      return NextResponse.json({ error: "Cette opération est déjà pointée." }, { status: 400 });
    }
    const { data: ligne } = await auth.admin
      .from("compta_lignes")
      .select("*")
      .eq("id", body.ligneId || "")
      .maybeSingle();
    if (!ligne) return NextResponse.json({ error: "Ligne de comptabilité introuvable." }, { status: 404 });
    if (ligne.sens !== op.sens) {
      return NextResponse.json(
        { error: "Une dépense ne peut pas être pointée avec une recette (ni l'inverse)." },
        { status: 400 }
      );
    }
    const { data: dejaLiee } = await auth.admin
      .from("compta_operations")
      .select("id")
      .eq("ligne_id", ligne.id)
      .maybeSingle();
    if (dejaLiee) {
      return NextResponse.json({ error: "Cette ligne est déjà pointée avec une autre opération." }, { status: 409 });
    }
    const r = await appliquerPointage(auth.admin, op, ligne, auth.parent.id, "manuel");
    if (r.error) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "ignorer") {
    const { error } = await auth.admin
      .from("compta_operations")
      .update({
        statut: "ignoree",
        note: String(body.note || "").trim().slice(0, 300) || null,
        ligne_id: null,
        mode_pointage: null,
        pointee_le: new Date().toISOString(),
        pointee_par: auth.parent.id,
      })
      .eq("id", op.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "rouvrir") {
    // La ligne de compta redevient « à pointer » (sa référence bancaire est
    // effacée). L'état « payée » posé au pointage, lui, reste : il se corrige
    // à la main sur la ligne si besoin.
    if (op.ligne_id) {
      await auth.admin
        .from("compta_lignes")
        .update({ statut: "a_verifier", pointe_le: null, pointe_par: null, ref_bancaire: null })
        .eq("id", op.ligne_id);
    }
    const { error } = await auth.admin
      .from("compta_operations")
      .update({
        statut: "a_pointer",
        ligne_id: null,
        mode_pointage: null,
        note: null,
        pointee_le: null,
        pointee_par: null,
      })
      .eq("id", op.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
