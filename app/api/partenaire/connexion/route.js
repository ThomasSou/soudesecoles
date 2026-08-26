import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

// Vérifie le code PIN d'un partenaire et renvoie son identité si le compte
// est actif. Aucune connexion n'est requise : le PIN est le seul rempart,
// il doit rester confidentiel (communiqué de vive voix ou par e-mail direct
// au partenaire, jamais publié).
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const pin = body?.pin?.trim();
  if (!pin) return NextResponse.json({ error: "Code manquant." }, { status: 400 });

  const admin = createAdminClient();
  const { data: partenaire } = await admin
    .from("partenaires")
    .select("id, nom, active")
    .eq("pin_code", pin)
    .maybeSingle();

  if (!partenaire || !partenaire.active) {
    return NextResponse.json({ error: "Code invalide ou compte désactivé." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, partenaire: { id: partenaire.id, nom: partenaire.nom } });
}
