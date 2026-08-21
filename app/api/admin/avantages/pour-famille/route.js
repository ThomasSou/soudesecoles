import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Liste les avantages internes actifs et indique, pour la famille donnée,
// lesquels ont déjà été utilisés. Sert au panneau affiché sur la page de
// vérification de carte quand un membre du bureau la consulte.
export async function GET(request) {
  const auth = await requirePermission(request, "avantages");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const familyId = searchParams.get("familyId");
  if (!familyId) return NextResponse.json({ error: "familyId manquant." }, { status: 400 });

  const { data: avantages, error } = await auth.admin
    .from("avantages")
    .select("id, label, requiert_adhesion")
    .eq("type", "interne")
    .eq("active", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!avantages || avantages.length === 0) return NextResponse.json({ ok: true, avantages: [] });

  const { data: utilisations } = await auth.admin
    .from("avantage_utilisations")
    .select("avantage_id, used_at, used_by")
    .eq("family_id", familyId)
    .in("avantage_id", avantages.map((a) => a.id));

  const parUtilisation = {};
  for (const u of utilisations || []) parUtilisation[u.avantage_id] = u;

  return NextResponse.json({
    ok: true,
    avantages: avantages.map((a) => ({
      ...a,
      utilise: Boolean(parUtilisation[a.id]),
      usedAt: parUtilisation[a.id]?.used_at || null,
      usedBy: parUtilisation[a.id]?.used_by || null,
    })),
  });
}
