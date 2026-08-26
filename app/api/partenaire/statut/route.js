import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { resolveFamilleParToken } from "../../../lib/avantages";

export const dynamic = "force-dynamic";

// Indique si la carte scannée a déjà utilisé l'offre partenaire, sans rien
// enregistrer. Permet d'afficher l'état avant de proposer le bouton Valider.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const { avantageId, pin, token } = body || {};
  if (!avantageId || !pin || !token) {
    return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: avantage } = await admin
    .from("avantages")
    .select("id, label, partner_name, active, type, requiert_adhesion, limite")
    .eq("id", avantageId)
    .eq("pin_code", pin)
    .eq("type", "partenaire")
    .maybeSingle();

  if (!avantage || !avantage.active) {
    return NextResponse.json({ error: "Offre introuvable ou inactive." }, { status: 404 });
  }

  const { familyId, adhesionValide } = await resolveFamilleParToken(admin, token);
  if (!familyId) return NextResponse.json({ error: "Carte inconnue." }, { status: 404 });

  const { data: utilisations } = await admin
    .from("avantage_utilisations")
    .select("used_at, used_by")
    .eq("avantage_id", avantageId)
    .eq("family_id", familyId)
    .order("used_at", { ascending: false });

  const fois = (utilisations || []).length;

  return NextResponse.json({
    ok: true,
    label: avantage.label,
    adhesionValide,
    adhesionRequise: avantage.requiert_adhesion,
    limite: avantage.limite,
    fois,
    dejaUtilise: fois >= avantage.limite,
    usedAt: utilisations?.[0]?.used_at || null,
  });
}
