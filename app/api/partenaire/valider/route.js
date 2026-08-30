import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { resolveFamilleParToken, resolvePartenaire } from "../../../lib/avantages";

export const dynamic = "force-dynamic";

// Enregistre l'utilisation d'un avantage partenaire pour la famille
// scannée, jusqu'à la limite configurée. L'avantage doit appartenir au
// partenaire connecté.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const { partenaireId, pin, avantageId, token } = body || {};
  if (!partenaireId || !pin || !avantageId || !token) {
    return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });
  }

  const admin = createAdminClient();
  const partenaire = await resolvePartenaire(admin, partenaireId, pin);
  if (!partenaire) return NextResponse.json({ error: "Compte partenaire invalide." }, { status: 404 });

  const { data: avantage } = await admin
    .from("avantages")
    .select("id, active, requiert_adhesion, limite")
    .eq("id", avantageId)
    .eq("partenaire_id", partenaireId)
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

  const { data: existantes } = await admin
    .from("avantage_utilisations")
    .select("used_at, used_by")
    .eq("avantage_id", avantageId)
    .eq("family_id", familyId)
    .order("used_at", { ascending: false });

  const usages = existantes || [];
  // limite 0 ou nulle = usage illimité : aucun plafond n'est opposé.
  const illimite = !avantage.limite || avantage.limite <= 0;

  // Contrôle serveur : ne jamais insérer au-delà de la limite, même si
  // l'UI a laissé passer un clic. On renvoie de quoi afficher le bon
  // message côté page (date et auteur de la dernière utilisation).
  if (!illimite && usages.length >= avantage.limite) {
    return NextResponse.json(
      {
        ok: false,
        dejaUtilise: true,
        limiteAtteinte: true,
        limite: avantage.limite,
        fois: usages.length,
        usedAt: usages[0]?.used_at || null,
        usedBy: usages[0]?.used_by || null,
      },
      { status: 409 }
    );
  }

  const { error } = await admin.from("avantage_utilisations").insert({
    avantage_id: avantageId,
    family_id: familyId,
    used_by: partenaire.nom,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, fois: usages.length + 1, limite: avantage.limite });
}
