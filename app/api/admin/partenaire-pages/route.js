import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// GET : pages envoyées par les partenaires (?statut=soumis par défaut, "tous" pour tout).
export async function GET(request) {
  const auth = await requirePermission(request, "partenaires");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const statut = new URL(request.url).searchParams.get("statut") || "soumis";
  let q = auth.admin.from("partenaire_pages").select("*").order("soumis_le", { ascending: true, nullsFirst: false });
  if (statut !== "tous") q = q.eq("statut", statut);
  const { data: pages, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (pages || []).map((p) => p.partenaire_id);
  const { data: partenaires } = ids.length
    ? await auth.admin.from("partenaires").select("id, nom, slug").in("id", ids)
    : { data: [] };
  const parId = Object.fromEntries((partenaires || []).map((p) => [p.id, p]));

  return NextResponse.json({
    ok: true,
    pages: (pages || []).map((p) => ({
      ...p,
      partenaireNom: parId[p.partenaire_id]?.nom || "—",
      slug: parId[p.partenaire_id]?.slug || null,
    })),
  });
}
