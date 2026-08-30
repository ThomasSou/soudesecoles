import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { resolveFamilleParToken, resolvePartenaire } from "../../../lib/avantages";

export const dynamic = "force-dynamic";

// Liste tous les avantages actifs du partenaire connecté et indique, pour
// la famille scannée, lesquels ont déjà été utilisés. Sert au panneau
// affiché sur la page de vérification de carte — un partenaire voit
// toujours l'ensemble de SES avantages en une fois, comme le bureau voit
// tous les avantages internes.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const { partenaireId, pin, token } = body || {};
  if (!partenaireId || !pin || !token) {
    return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });
  }

  const admin = createAdminClient();
  const partenaire = await resolvePartenaire(admin, partenaireId, pin);
  if (!partenaire) return NextResponse.json({ error: "Compte partenaire invalide." }, { status: 404 });

  const { familyId, adhesionValide } = await resolveFamilleParToken(admin, token);
  if (!familyId) return NextResponse.json({ error: "Carte inconnue." }, { status: 404 });

  const { data: avantages } = await admin
    .from("avantages")
    .select("id, label, requiert_adhesion, limite")
    .eq("partenaire_id", partenaireId)
    .eq("active", true);

  if (!avantages || avantages.length === 0) {
    return NextResponse.json({ ok: true, partenaireNom: partenaire.nom, avantages: [] });
  }

  const { data: utilisations } = await admin
    .from("avantage_utilisations")
    .select("avantage_id, used_at, used_by")
    .eq("family_id", familyId)
    .in("avantage_id", avantages.map((a) => a.id))
    .order("used_at", { ascending: false });

  const parAvantage = {};
  for (const u of utilisations || []) {
    (parAvantage[u.avantage_id] = parAvantage[u.avantage_id] || []).push(u);
  }

  return NextResponse.json({
    ok: true,
    partenaireNom: partenaire.nom,
    avantages: avantages.map((a) => {
      const usages = parAvantage[a.id] || [];
      const fois = usages.length;
      const illimite = !a.limite || a.limite <= 0;
      return {
        id: a.id,
        label: a.label,
        limite: a.limite,
        fois,
        utilise: !illimite && fois >= a.limite,
        usedAt: usages[0]?.used_at || null,
        usedBy: usages[0]?.used_by || null,
        bloque: a.requiert_adhesion && !adhesionValide,
      };
    }),
  });
}
