import { NextResponse } from "next/server";
import { requireAdmin } from "../../../lib/adminAuth";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Permet au front de savoir si l'utilisateur connecté fait partie du bureau,
// et avec quels droits précis (permissions individuelles).
export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  // Un membre du bureau peut aussi être partenaire (même compte) : on lui
  // affiche alors un lien vers son espace partenaire.
  const { data: moi } = await auth.admin.from("parents").select("auth_user_id").eq("id", auth.parent.id).maybeSingle();
  let estPartenaire = false;
  if (moi?.auth_user_id) {
    const { data: fiche } = await auth.admin.from("partenaires").select("id").eq("auth_user_id", moi.auth_user_id).maybeSingle();
    estPartenaire = Boolean(fiche);
  }
  return NextResponse.json({
    ok: true,
    estPartenaire,
    parent: {
      firstName: auth.parent.first_name,
      lastName: auth.parent.last_name,
      email: auth.parent.email,
      title: auth.parent.title,
      permissions: auth.parent.permissions || {},
    },
  });
}
