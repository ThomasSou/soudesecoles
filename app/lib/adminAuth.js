import { createAdminClient } from "./supabaseServerAdmin";

// Rôles autorisés à accéder au back-office.
export const ADMIN_ROLES = ["admin_general", "admin_commission"];

// Vérifie le jeton d'accès envoyé par le navigateur et renvoie le parent
// correspondant s'il fait partie du bureau. Toute la lecture/écriture
// administrative passe ensuite par la clé secrète (contourne RLS), donc ce
// contrôle est le seul rempart : il doit rester strict.
export async function requireAdmin(request) {
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    return { error: "Non authentifié.", status: 401 };
  }

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    return { error: "Session invalide.", status: 401 };
  }

  const { data: parent } = await admin
    .from("parents")
    .select("id, first_name, last_name, email, role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!parent || !ADMIN_ROLES.includes(parent.role)) {
    return { error: "Accès réservé au bureau de l'association.", status: 403 };
  }

  return { admin, parent };
}
