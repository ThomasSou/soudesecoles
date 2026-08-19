import { NextResponse } from "next/server";
import { createAdminClient } from "../../lib/supabaseServerAdmin";

// Route temporaire, protegee par le meme jeton que /api/admin-import-test.
// Permet de renvoyer une invitation (ou d'en generer une nouvelle) a un
// utilisateur deja existant, sans recreer de ligne "families"/"children".
// Utile pour retester le parcours d'activation de compte apres correction
// du Site URL / de la page /activer-compte.
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
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${SITE_URL}/activer-compte`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, userId: data.user?.id });
}
