import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { enregistrerSignature } from "../../../../lib/facturesEmises";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Dépose l'image de la signature du président (bucket privé). Elle apparaît
// ensuite sur chaque PDF de facture.
export async function POST(request) {
  const auth = await requirePermission(request, "comptabilite");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => null);
  const r = await enregistrerSignature(auth.admin, body?.imageDataUrl);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
