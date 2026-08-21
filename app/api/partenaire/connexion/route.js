import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

// Vérifie le code PIN donné à un partenaire et renvoie l'avantage associé
// s'il est actif. Aucune connexion n'est requise : le PIN est le seul
// rempart, il doit rester confidentiel (communiqué de vive voix ou par
// e-mail direct au partenaire, jamais publié).
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const pin = body?.pin?.trim();
  if (!pin) return NextResponse.json({ error: "Code manquant." }, { status: 400 });

  const admin = createAdminClient();
  const { data: avantage } = await admin
    .from("avantages")
    .select("id, label, partner_name, active, type")
    .eq("pin_code", pin)
    .eq("type", "partenaire")
    .maybeSingle();

  if (!avantage || !avantage.active) {
    return NextResponse.json({ error: "Code invalide ou offre inactive." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    avantage: { id: avantage.id, label: avantage.label, partnerName: avantage.partner_name },
  });
}
