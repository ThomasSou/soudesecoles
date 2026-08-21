import { NextResponse } from "next/server";
import { incrementerStat } from "../../lib/stats";

export const dynamic = "force-dynamic";

// Collecte de statistiques SANS cookie et SANS donnée personnelle.
// On n'enregistre ni adresse IP, ni identifiant de visiteur : uniquement un
// compteur par jour et par cible. Il est donc impossible de reconstituer le
// parcours d'une personne, ce qui dispense le site de bandeau de consentement.
const KINDS = new Set(["page", "lien"]);

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const kind = body?.kind;
  const target = typeof body?.target === "string" ? body.target.slice(0, 500) : "";

  if (!KINDS.has(kind) || !target) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await incrementerStat(kind, target);

  return NextResponse.json({ ok: true });
}
