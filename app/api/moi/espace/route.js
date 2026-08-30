import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { resoudreEspace } from "../../../lib/redirectionRole";

export const dynamic = "force-dynamic";

// Renvoie l'espace d'accueil du compte connecté, pour qu'UNE SEULE page de
// connexion redirige chacun vers le bon endroit après login :
//   bureau > enseignant/direction > partenaire > parent.
//
// Consommée par app/connexion/page.js et app/activer-compte/page.js. Remplace
// l'ancienne route /api/roles (schéma partenaire seul).
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userData, error } = await admin.auth.getUser(accessToken);
  if (error || !userData?.user) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  const redirect = await resoudreEspace(admin, userData.user.id);
  return NextResponse.json({ ok: true, redirect });
}
