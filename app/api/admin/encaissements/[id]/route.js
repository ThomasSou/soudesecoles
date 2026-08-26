import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { confirmEncaissementIfPaid } from "../../../../lib/encaissementsLibres";

export const dynamic = "force-dynamic";

// Statut d'un encaissement, consulté depuis la page de retour du
// back-office. Revérifie systématiquement auprès de HelloAsso plutôt que de
// faire confiance au seul paramètre d'URL.
export async function GET(request, { params }) {
  const auth = await requirePermission(request, "encaissements");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const encaissement = await confirmEncaissementIfPaid(params.id);
  if (!encaissement) {
    return NextResponse.json({ error: "Encaissement introuvable." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, encaissement });
}
