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
    .select("id, label, partner_name, active, type, requiert_adhesion")
    .eq("id", avantageId)
    .eq("pin_code", pin)
    .eq("type", "partenaire")
    .maybeSingle();

  if (!avantage || !avantage.active) {
    return NextResponse.json({ error: "Offre introuvable ou inactive." }, { status: 404 });
  }

  const { familyId, adhesionValide } = await resolveFamilleParToken(admin, token);
  if (!familyId) return NextResponse.json({ error: "Carte inconnue." }, { status: 404 });

  const { data: utilisation } = await admin
    .from("avantage_utilisations")
    .select("used_at, used_by")
    .eq("avantage_id", avantageId)
    .eq("family_id", familyId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    label: avantage.label,
    adhesionValide,
    adhesionRequise: avantage.requiert_adhesion,
    dejaUtilise: Boolean(utilisation),
    usedAt: utilisation?.used_at || null,
  });
}
