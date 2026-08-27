import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

// Identifie (facultativement) le visiteur s'il est connecté à son espace
// adhérent, pour préremplir le formulaire d'inscription bénévole. Ne bloque
// jamais : sans jeton valide, renvoie { parent: null } et l'inscription
// continue en visiteur.
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return NextResponse.json({ ok: true, parent: null });
  }

  const admin = createAdminClient();
  const { data: userData, error } = await admin.auth.getUser(accessToken);
  if (error || !userData?.user) {
    return NextResponse.json({ ok: true, parent: null });
  }

  const { data: parent } = await admin
    .from("parents")
    .select("id, first_name, last_name, email, phone")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (!parent) return NextResponse.json({ ok: true, parent: null });

  return NextResponse.json({
    ok: true,
    parent: {
      firstName: parent.first_name,
      lastName: parent.last_name,
      email: parent.email,
      phone: parent.phone,
    },
  });
}
