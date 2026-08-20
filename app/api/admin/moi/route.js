import { NextResponse } from "next/server";
import { requireAdmin } from "../../../lib/adminAuth";

// Permet au front de savoir si l'utilisateur connecté fait partie du bureau,
// et avec quels droits précis (permissions individuelles).
export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return NextResponse.json({
    ok: true,
    parent: {
      firstName: auth.parent.first_name,
      lastName: auth.parent.last_name,
      title: auth.parent.title,
      permissions: auth.parent.permissions || {},
    },
  });
}
