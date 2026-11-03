import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { nettoyerContenu } from "../../../../lib/partenairePages";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// PATCH : le bureau valide (→ la version envoyée devient publique) ou refuse
// (motif obligatoire, le partenaire peut corriger et renvoyer).
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, "partenaires");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const decision = body?.decision;
  const motif = body?.motif?.trim() || null;
  if (!["valide", "refuse"].includes(decision)) return NextResponse.json({ error: "Décision invalide." }, { status: 400 });
  if (decision === "refuse" && !motif) return NextResponse.json({ error: "Indiquez un motif de refus." }, { status: 400 });

  const { data: page } = await auth.admin.from("partenaire_pages").select("*").eq("id", params.id).maybeSingle();
  if (!page) return NextResponse.json({ error: "Page introuvable." }, { status: 404 });
  if (page.statut !== "soumis") return NextResponse.json({ error: "Cette page n'est pas en attente de validation." }, { status: 409 });

  const maintenant = new Date().toISOString();
  const maj =
    decision === "valide"
      ? {
          // Re-nettoyé par prudence : on ne publie que du contenu conforme.
          publie: nettoyerContenu(page.brouillon, page.partenaire_id),
          statut: "publie",
          publie_le: maintenant,
          motif_refus: null,
        }
      : { statut: "refuse", motif_refus: motif };
  const { error } = await auth.admin.from("partenaire_pages").update({ ...maj, updated_at: maintenant }).eq("id", page.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
