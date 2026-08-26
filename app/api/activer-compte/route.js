import { NextResponse } from "next/server";
import { createAdminClient } from "../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

// Définit le mot de passe d'un compte à partir du jeton d'invitation envoyé
// par e-mail (circuit maison utilisé quand Sender gère l'envoi — voir
// app/lib/invitations.js). Le jeton est à usage unique et expire au bout de
// 7 jours. N'envoie et ne génère aucun e-mail Supabase : c'est justement ce
// qui rend ce circuit fiable.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  const password = body?.password;

  if (!token || !password) {
    return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Le mot de passe doit contenir au moins 8 caractères." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: invitation } = await admin
    .from("invitations")
    .select("id, email, user_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (!invitation || !invitation.user_id) {
    return NextResponse.json({ error: "Ce lien d'invitation n'est plus valide." }, { status: 404 });
  }
  if (invitation.used_at) {
    return NextResponse.json(
      { error: "Ce lien a déjà été utilisé. Utilisez plutôt \"Mot de passe oublié\"." },
      { status: 409 }
    );
  }
  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "Ce lien d'invitation a expiré. Contactez le Sou des Écoles pour en recevoir un nouveau." },
      { status: 410 }
    );
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(invitation.user_id, { password });
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await admin.from("invitations").update({ used_at: new Date().toISOString() }).eq("id", invitation.id);

  return NextResponse.json({ ok: true, email: invitation.email });
}
