import { NextResponse } from "next/server";
import { requireEnseignant } from "../../../lib/enseignantAuth";

export const dynamic = "force-dynamic";

// Permet au front de savoir si l'utilisateur connecté est un enseignant / la
// direction (et de récupérer son identité pour l'affichage). Même rôle que
// /api/admin/moi pour le back-office.
export async function GET(request) {
  const auth = await requireEnseignant(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return NextResponse.json({
    ok: true,
    enseignant: {
      id: auth.teacher.id,
      firstName: auth.teacher.first_name,
      lastName: auth.teacher.last_name,
      email: auth.teacher.email,
      role: auth.teacher.role,
    },
  });
}
