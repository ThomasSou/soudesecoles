import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { confirmMembershipIfPaid } from "../../../lib/adhesionPaiement";
import { currentSchoolYear } from "../../../lib/anneeScolaire";

// Vérifie si la cotisation en cours de paiement pour la famille du parent
// connecté a bien été réglée. Revérifie systématiquement auprès de
// HelloAsso (voir confirmMembershipIfPaid).
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  const { data: parent } = await admin
    .from("parents")
    .select("family_id")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (!parent?.family_id) {
    return NextResponse.json({ error: "Aucune famille rattachée à ce compte." }, { status: 400 });
  }

  const result = await confirmMembershipIfPaid(parent.family_id, currentSchoolYear());
  return NextResponse.json({ ok: true, ...result });
}
