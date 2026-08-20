import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "../../../lib/adminAuth";

const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

function cleanPermissions(input) {
  const out = {};
  for (const key of PERMISSION_KEYS) {
    out[key] = Boolean(input && input[key]);
  }
  return out;
}

// Liste tous les parents (toutes familles), pour pouvoir accorder ou
// retirer l'accès back-office et les droits individuels.
export async function GET(request) {
  const auth = await requirePermission(request, "acces");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [parentsRes, familiesRes] = await Promise.all([
    auth.admin.from("parents").select("*").order("last_name"),
    auth.admin.from("families").select("id, address_line, city"),
  ]);

  if (parentsRes.error) {
    return NextResponse.json({ error: parentsRes.error.message }, { status: 500 });
  }

  const familiesById = Object.fromEntries(
    (familiesRes.data || []).map((f) => [f.id, f])
  );

  const membres = (parentsRes.data || []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    email: p.email,
    title: p.title,
    isAdmin: p.is_admin,
    permissions: p.permissions || {},
    familyId: p.family_id,
    familyAddress: familiesById[p.family_id]?.address_line || "",
  }));

  return NextResponse.json({ membres, permissions: PERMISSIONS });
}

// Met à jour l'accès back-office, les droits individuels et la fonction
// (ex. "Présidente") d'un parent.
export async function POST(request) {
  const auth = await requirePermission(request, "acces");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { parentId, isAdmin, permissions, title } = await request.json();
  if (!parentId) {
    return NextResponse.json({ error: "Identifiant du parent manquant." }, { status: 400 });
  }

  // Garde-fou : on ne peut pas se retirer soi-même l'accès ou le droit
  // "acces", pour éviter de verrouiller tout le monde en dehors du
  // back-office par erreur. Ça doit être fait par quelqu'un d'autre.
  if (parentId === auth.parent.id && (isAdmin === false || permissions?.acces === false)) {
    return NextResponse.json(
      {
        error:
          "Vous ne pouvez pas retirer votre propre accès au back-office ou votre droit de gestion des accès. Demandez à un autre membre du bureau de le faire.",
      },
      { status: 400 }
    );
  }

  const { error } = await auth.admin
    .from("parents")
    .update({
      is_admin: Boolean(isAdmin),
      permissions: cleanPermissions(permissions),
      title: title?.trim() || null,
    })
    .eq("id", parentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
