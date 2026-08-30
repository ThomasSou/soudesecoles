import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";

export const dynamic = "force-dynamic";

const PERM = "partenaires";

// GET : messages "nouveautés" des partenaires pour l'écran de modération du
// bureau. Filtre par statut (?statut=soumis par défaut ; "tous" pour tout).
export async function GET(request) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const statut = new URL(request.url).searchParams.get("statut") || "soumis";

  let query = auth.admin
    .from("partenaire_messages")
    .select("*")
    .order("soumis_le", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (statut !== "tous") query = query.eq("statut", statut);

  const { data: messages, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = [...new Set((messages || []).map((m) => m.partenaire_id))];
  const { data: partenaires } = ids.length
    ? await auth.admin.from("partenaires").select("id, nom").in("id", ids)
    : { data: [] };
  const nomParId = Object.fromEntries((partenaires || []).map((p) => [p.id, p.nom]));

  return NextResponse.json({
    ok: true,
    messages: (messages || []).map((m) => ({ ...m, partenaireNom: nomParId[m.partenaire_id] || "—" })),
  });
}
