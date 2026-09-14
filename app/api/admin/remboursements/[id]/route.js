import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "refused", "reimbursed"];

// "force-dynamic" empêche Next.js de mettre en cache la route, mais
// n'envoie qu'un en-tête "no-cache" (négociable) — le CDN Netlify a été vu
// servir une réponse périmée après une modification. "no-store" est sans
// ambiguïté : jamais mis en cache. "Netlify-CDN-Cache-Control" est l'en-tête
// que le CDN Netlify regarde en priorité pour SON PROPRE cache.
const NO_STORE = {
  headers: {
    "Cache-Control": "no-store",
    "Netlify-CDN-Cache-Control": "no-store",
  },
};

// Change le statut d'une demande (traitée : remboursée ou refusée) et/ou sa
// note interne. C'est ce changement, fait ici, qui fait apparaître le
// statut "Remboursé" côté parent — jamais avant.
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, "remboursements");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status, ...NO_STORE });

  const body = await request.json().catch(() => null);
  const status = body?.status;
  const adminNote = body?.adminNote?.trim() || null;

  if (status && !STATUSES.includes(status)) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400, ...NO_STORE });
  }

  const update = { admin_note: adminNote };
  if (status) {
    update.status = status;
    update.processed_at = status === "pending" ? null : new Date().toISOString();
    update.processed_by = status === "pending" ? null : auth.parent.id;
  }

  const { data, error } = await auth.admin
    .from("reimbursement_requests")
    .update(update)
    .eq("id", params.id)
    .select("id, status, processed_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500, ...NO_STORE });
  // .update() ne renvoie pas d'erreur quand aucune ligne ne correspond (id
  // inconnu, ligne déjà supprimée...) : sans ce contrôle, l'API répondait
  // "ok" alors que rien n'avait changé — silencieux côté bureau.
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Cette demande n'existe plus ou a déjà été modifiée ailleurs." },
      { status: 404, ...NO_STORE }
    );
  }
  // DIAGNOSTIC TEMPORAIRE : renvoie la ligne telle que Supabase la voit
  // juste après l'update, dans la même requête (aucun cache possible ici).
  return NextResponse.json({ ok: true, debug: data[0] }, NO_STORE);
}
