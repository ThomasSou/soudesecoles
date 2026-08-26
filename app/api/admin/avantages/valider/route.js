import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { resolveFamilleParToken } from "../../../../lib/avantages";

export const dynamic = "force-dynamic";

// Valide un avantage interne pour la famille correspondant au jeton de
// carte scanné. Le jeton fait foi : on ne fait jamais confiance à un
// familyId envoyé par le client.
export async function POST(request) {
  const auth = await requirePermission(request, "avantages");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const avantageId = body?.avantageId;
  const token = body?.token;
  if (!avantageId || !token) {
    return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });
  }

  const { data: avantage } = await auth.admin
    .from("avantages")
    .select("id, label, type, active, requiert_adhesion, limite")
    .eq("id", avantageId)
    .maybeSingle();

  if (!avantage || avantage.type !== "interne" || !avantage.active) {
    return NextResponse.json({ error: "Avantage introuvable ou inactif." }, { status: 404 });
  }

  const { familyId, adhesionValide } = await resolveFamilleParToken(auth.admin, token);
  if (!familyId) {
    return NextResponse.json({ error: "Carte inconnue." }, { status: 404 });
  }
  if (avantage.requiert_adhesion && !adhesionValide) {
    return NextResponse.json({ error: "Adhésion non à jour : avantage non applicable." }, { status: 403 });
  }

  const { data: existantes } = await auth.admin
    .from("avantage_utilisations")
    .select("used_at, used_by")
    .eq("avantage_id", avantageId)
    .eq("family_id", familyId)
    .order("used_at", { ascending: false });

  if ((existantes || []).length >= avantage.limite) {
    return NextResponse.json(
      {
        ok: false,
        dejaUtilise: true,
        limiteAtteinte: true,
        limite: avantage.limite,
        fois: existantes.length,
        usedAt: existantes[0]?.used_at || null,
        usedBy: existantes[0]?.used_by || null,
      },
      { status: 409 }
    );
  }

  const usedBy = `${auth.parent.first_name || ""} ${auth.parent.last_name || ""}`.trim() || "Bureau";

  const { error } = await auth.admin
    .from("avantage_utilisations")
    .insert({ avantage_id: avantageId, family_id: familyId, used_by: usedBy });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, fois: (existantes || []).length + 1, limite: avantage.limite });
}
