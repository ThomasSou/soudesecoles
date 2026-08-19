import { NextResponse } from "next/server";
import { createAdminClient } from "../../lib/supabaseServerAdmin";

// Route temporaire, protegee par le meme jeton que les autres routes admin.
// Genere directement un lien d'action (recovery) sans passer par l'envoi
// d'e-mail Supabase, pour contourner un souci de lien grille avant que
// l'utilisateur ne clique dessus (scanner anti-phishing, previsualisation
// d'e-mail, etc.).
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
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${SITE_URL}/activer-compte` },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, link: data.properties?.action_link });
}
