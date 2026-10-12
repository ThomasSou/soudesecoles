import { NextResponse } from "next/server";
import { confirmMembershipIfPaid } from "../../../lib/adhesionPaiement";
import { currentSchoolYear } from "../../../lib/anneeScolaire";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Au retour de la page de paiement HelloAsso (page publique /cotisation) :
// revérifie auprès de HelloAsso et confirme la cotisation de la famille. Ne
// renvoie que « payée ou non » : la confirmation vient toujours de HelloAsso,
// jamais du simple fait d'appeler cette route.
export async function POST(request) {
  const { familyId } = await request.json().catch(() => ({}));
  if (!familyId || typeof familyId !== "string") {
    return NextResponse.json({ error: "Famille manquante." }, { status: 400 });
  }
  const result = await confirmMembershipIfPaid(familyId, currentSchoolYear());
  return NextResponse.json({ ok: true, paid: Boolean(result.paid) });
}
