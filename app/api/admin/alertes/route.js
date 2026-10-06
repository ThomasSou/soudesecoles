import { NextResponse } from "next/server";
import { requireAdmin } from "../../../lib/adminAuth";
import { compterAlertes } from "../../../lib/alertes";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Ce qui attend un traitement, limité aux sections auxquelles la personne a
// droit (menu et tableau de bord du back-office).
export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const alertes = await compterAlertes(auth.admin, auth.parent.permissions || {});
  return NextResponse.json({ ok: true, alertes });
}
