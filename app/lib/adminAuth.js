import { createAdminClient } from "./supabaseServerAdmin";

// Droits individuels paramétrables pour le back-office. Chaque personne
// admise dans le back-office (is_admin = true) reçoit un sous-ensemble de
// ces droits, accordé un par un plutôt que par un rôle figé.
export const PERMISSIONS = [
  { key: "familles", label: "Fiches familles et adhésions (encaissement compris)" },
  { key: "demandes", label: "Demandes d'inscription" },
  { key: "messages", label: "Messages reçus" },
  { key: "emails", label: "Envoi d'e-mails" },
  { key: "boutique", label: "Boutique en ligne (produits et commandes)" },
  { key: "avantages", label: "Avantages (boisson offerte, offres partenaires)" },
  { key: "benevoles", label: "Créneaux bénévoles" },
  { key: "statistiques", label: "Statistiques de fréquentation" },
  { key: "acces", label: "Gestion des accès et permissions du bureau" },
];

// Vérifie le jeton d'accès envoyé par le navigateur et renvoie le parent
// correspondant s'il est admis dans le back-office (is_admin). Toute la
// lecture/écriture administrative passe ensuite par la clé secrète
// (contourne RLS), donc ce contrôle est le seul rempart : il doit rester
// strict.
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
    .select("id, first_name, last_name, email, is_admin, permissions, title")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!parent || !parent.is_admin) {
    return { error: "Accès réservé au bureau de l'association.", status: 403 };
  }

  return { admin, parent };
}

export function hasPermission(parent, key) {
  return Boolean(parent?.permissions && parent.permissions[key]);
}

// Comme requireAdmin, mais exige en plus un droit précis (cf. PERMISSIONS).
export async function requirePermission(request, key) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth;

  if (!hasPermission(auth.parent, key)) {
    return {
      error: "Vous n'avez pas les droits nécessaires pour cette section.",
      status: 403,
    };
  }

  return auth;
}
