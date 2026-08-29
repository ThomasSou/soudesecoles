import { createAdminClient } from "./supabaseServerAdmin";

// Contrôle d'accès de l'espace enseignant, sur le même modèle que
// app/lib/adminAuth.js pour le back-office : on vérifie le jeton porteur
// envoyé par le navigateur, on retrouve la fiche `teachers` par
// `auth_user_id`, et on refuse si le compte n'est pas actif.
//
// Comme pour le back-office, toute la lecture/écriture passe ensuite par la
// clé de service (contourne RLS) : ce contrôle est le seul rempart, il doit
// rester strict. Ne jamais faire confiance à un `teacherId` envoyé par le
// client : toujours le déduire du jeton.
export async function requireEnseignant(request) {
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

  const { data: teacher } = await admin
    .from("teachers")
    .select("id, first_name, last_name, email, role, active")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (!teacher || !teacher.active) {
    return { error: "Accès réservé aux enseignants et à la direction.", status: 403 };
  }

  return { admin, teacher };
}
