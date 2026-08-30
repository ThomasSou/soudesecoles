import { NextResponse } from "next/server";
import { createAdminClient } from "../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

// Renvoie le "rôle" du compte connecté, pour permettre à UNE SEULE page de
// connexion de rediriger chacun vers son espace après login (parent →
// /espace-adherent, partenaire → /partenaire, membre du bureau → /admin).
//
// POINT D'INTÉGRATION : la page /connexion et la page /activer-compte
// redirigent aujourd'hui en dur vers /espace-adherent. Elles devront
// appeler cette route et suivre `redirect`. Le sous-agent "espace
// enseignants" ajoutera ici la détection de son rôle.
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const admin = createAdminClient();
  const { data: userData, error } = await admin.auth.getUser(accessToken);
  if (error || !userData?.user) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }
  const uid = userData.user.id;

  const [{ data: parent }, { data: partenaire }] = await Promise.all([
    admin.from("parents").select("id, is_admin").eq("auth_user_id", uid).maybeSingle(),
    admin.from("partenaires").select("id, active").eq("auth_user_id", uid).maybeSingle(),
  ]);

  const estAdmin = Boolean(parent?.is_admin);
  const estPartenaire = Boolean(partenaire && partenaire.active);

  let redirect = "/espace-adherent";
  let role = "parent";
  if (estAdmin) {
    redirect = "/admin";
    role = "admin";
  } else if (estPartenaire) {
    redirect = "/partenaire";
    role = "partenaire";
  }

  return NextResponse.json({ ok: true, role, estAdmin, estPartenaire, redirect });
}
