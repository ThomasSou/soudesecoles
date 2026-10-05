import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";
import { confirmMembershipIfPaid } from "../../../../../lib/adhesionPaiement";
import { currentSchoolYear } from "../../../../../lib/anneeScolaire";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Au retour de la page de paiement HelloAsso, vérifie auprès de HelloAsso si
// la cotisation de cette famille a bien été réglée, et la confirme le cas
// échéant (le webhook le fait aussi : ceci donne juste le résultat tout de
// suite à l'écran).
export async function POST(request) {
  const auth = await requirePermission(request, "familles");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { familyId } = await request.json().catch(() => ({}));
  if (!familyId) {
    return NextResponse.json({ error: "Famille manquante." }, { status: 400 });
  }
  const result = await confirmMembershipIfPaid(familyId, currentSchoolYear());
  return NextResponse.json({ ok: true, paid: Boolean(result.paid) });
}
