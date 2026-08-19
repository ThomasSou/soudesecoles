import { NextResponse } from "next/server";
import { createAdminClient } from "../../lib/supabaseServerAdmin";

// Route temporaire, protegee par le meme jeton que /api/admin-import-test.
// Permet de renvoyer un lien d'activation a un utilisateur, sans recreer de
// ligne "families"/"children" :
//  - s'il n'a pas encore de compte, on envoie une invitation classique ;
//  - s'il a deja un compte (mais n'a jamais fini de definir son mot de passe,
//    ou veut simplement re-tester), on envoie un e-mail de reinitialisation
//    de mot de passe, qui redirige aussi vers /activer-compte.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://soumontmerle.netlify.app";

export async function POST(request) {
  const token = request.headers.get("x-admin-token");
  if (!token || token !== process.env.ADMIN_IMPORT_TOKEN) {
    return NextResponse.json({ error: "Non autorise." }, { status: 401 });
  }

  const { email } = await request.json();
  if (!email) {
    return NextResponse.json({ error: "email requis." }, { status: 400 });
  }

  const admin = createAdminClient();
  const redirectTo = `${SITE_URL}/activer-compte`;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });

  if (!error) {
    return NextResponse.json({ ok: true, mode: "invite", userId: data.user?.id });
  }

  if (!/already been registered/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Utilisateur deja existant : on envoie un e-mail de reinitialisation de
  // mot de passe a la place (meme destination /activer-compte).
  const { error: resetError } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
  if (resetError) {
    return NextResponse.json({ error: resetError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, mode: "recovery" });
}
