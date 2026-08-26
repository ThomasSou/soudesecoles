import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabaseServerAdmin";
import { resolvePartenaire } from "../../../../lib/avantages";

export const dynamic = "force-dynamic";

// Permet à un partenaire connecté de créer lui-même un nouvel avantage,
// sans passer par le back-office du Sou des Écoles.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const { partenaireId, pin, label, requiresMembership, limite } = body || {};
  if (!partenaireId || !pin) {
    return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });
  }

  const admin = createAdminClient();
  const partenaire = await resolvePartenaire(admin, partenaireId, pin);
  if (!partenaire) return NextResponse.json({ error: "Compte partenaire invalide." }, { status: 404 });

  const libelle = label?.trim();
  if (!libelle) return NextResponse.json({ error: "Le nom de l'avantage est obligatoire." }, { status: 400 });

  const limiteNombre = Number(limite) || 1;
  if (limiteNombre < 1) {
    return NextResponse.json({ error: "La limite doit être d'au moins 1." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("avantages")
    .insert({
      label: libelle,
      type: "partenaire",
      partenaire_id: partenaireId,
      requiert_adhesion: requiresMembership !== false,
      limite: limiteNombre,
      active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, avantage: { ...data, utilisations: 0 } });
}
