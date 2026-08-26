import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { resolvePartenaire } from "../../../lib/avantages";

export const dynamic = "force-dynamic";

// Liste les avantages créés par le partenaire connecté, avec leur nombre
// d'utilisations. Un partenaire ne voit jamais les avantages d'un autre
// partenaire ni ceux du bureau.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const { partenaireId, pin } = body || {};
  if (!partenaireId || !pin) {
    return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });
  }

  const admin = createAdminClient();
  const partenaire = await resolvePartenaire(admin, partenaireId, pin);
  if (!partenaire) return NextResponse.json({ error: "Compte partenaire invalide." }, { status: 404 });

  const { data: avantages, error } = await admin
    .from("avantages")
    .select("*")
    .eq("partenaire_id", partenaireId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!avantages || avantages.length === 0) {
    return NextResponse.json({ ok: true, partenaireNom: partenaire.nom, avantages: [] });
  }

  const { data: utilisations } = await admin
    .from("avantage_utilisations")
    .select("avantage_id")
    .in("avantage_id", avantages.map((a) => a.id));

  const compteurs = {};
  for (const u of utilisations || []) {
    compteurs[u.avantage_id] = (compteurs[u.avantage_id] || 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    partenaireNom: partenaire.nom,
    avantages: avantages.map((a) => ({ ...a, utilisations: compteurs[a.id] || 0 })),
  });
}
