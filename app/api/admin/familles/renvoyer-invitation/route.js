import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { envoyerInvitation } from "../../../../lib/invitations";

// Renvoie une invitation à un parent qui a déjà une fiche `parents` mais dont
// le compte de connexion (auth.users) n'a jamais été activé (lien précédent
// expiré, perdu dans les spams, jamais cliqué...). Pour un compte auth déjà
// existant mais non confirmé, un nouveau lien à usage unique est régénéré au
// lieu d'échouer avec "already registered" (qui ne survient que si le
// compte est déjà confirmé).
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
    .select("id, email, first_name, last_name")
    .eq("id", parentId)
    .maybeSingle();

  if (parentError || !parent?.email) {
    return NextResponse.json({ error: "Parent introuvable." }, { status: 404 });
  }

  const { error: inviteError } = await envoyerInvitation(admin, {
    email: parent.email,
    firstName: parent.first_name,
    lastName: parent.last_name,
    parentId: parent.id,
  });

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
