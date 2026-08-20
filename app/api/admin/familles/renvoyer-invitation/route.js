import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://soumontmerle.netlify.app";

// Renvoie une invitation à un parent qui a déjà une fiche `parents` mais dont
// le compte de connexion (auth.users) n'a jamais été activé (lien précédent
// expiré, perdu dans les spams, jamais cliqué...). On rappelle simplement
// inviteUserByEmail : pour un compte auth déjà existant mais non confirmé,
// Supabase régénère un nouveau lien à usage unique au lieu d'échouer avec
// "already registered" (qui ne survient que si le compte est déjà confirmé).
export async function POST(request) {
  const auth = await requirePermission(request, "familles");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = auth.admin;

  const { parentId } = await request.json();
  if (!parentId) {
    return NextResponse.json({ error: "parentId requis." }, { status: 400 });
  }

  const { data: parent, error: parentError } = await admin
    .from("parents")
    .select("id, email")
    .eq("id", parentId)
    .maybeSingle();

  if (parentError || !parent?.email) {
    return NextResponse.json({ error: "Parent introuvable." }, { status: 404 });
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    parent.email,
    { redirectTo: `${SITE_URL}/activer-compte` }
  );

  if (inviteError) {
    if (/already been registered/i.test(inviteError.message)) {
      return NextResponse.json(
        {
          error:
            "Ce compte a déjà été activé (mot de passe déjà défini) : proposez plutôt le lien \"mot de passe oublié\".",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: `Envoi impossible : ${inviteError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
