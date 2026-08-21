import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { resolveFamilleParToken } from "../../../lib/avantages";

export const dynamic = "force-dynamic";

// Enregistre l'utilisation de l'offre partenaire pour la famille scannée.
// La contrainte unique (avantage_id, family_id) empêche toute double
// utilisation, même en cas de double clic ou de deux scans simultanés.
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
  if (avantage.requiert_adhesion && !adhesionValide) {
    return NextResponse.json({ error: "Adhésion non à jour : offre non applicable." }, { status: 403 });
  }

  const { error } = await admin.from("avantage_utilisations").insert({
    avantage_id: avantageId,
    family_id: familyId,
    used_by: avantage.partner_name || "Partenaire",
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ ok: false, dejaUtilise: true }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
