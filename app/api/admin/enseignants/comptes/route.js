import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { envoyerInvitationEnseignant } from "../../../../lib/invitationsEnseignants";

export const dynamic = "force-dynamic";

const ROLES = ["enseignant", "direction"];

// Liste des comptes enseignants, avec l'état d'activation du compte de
// connexion (auth_user_id présent = invitation activée).
export async function GET(request) {
  const auth = await requirePermission(request, "enseignants");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("teachers")
    .select("id, first_name, last_name, email, role, active, auth_user_id, invited_at, created_at")
    .order("last_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const comptes = (data || []).map((t) => ({
    id: t.id,
    firstName: t.first_name,
    lastName: t.last_name,
    email: t.email,
    role: t.role,
    active: t.active,
    compteActive: Boolean(t.auth_user_id),
    invitedAt: t.invited_at,
    createdAt: t.created_at,
  }));

  return NextResponse.json({ ok: true, comptes });
}

// Crée une fiche enseignant et lui envoie l'invitation à activer son compte
// (même circuit que les parents). Si la fiche existe déjà (même e-mail), on
// se contente de renvoyer l'invitation.
export async function POST(request) {
  const auth = await requirePermission(request, "enseignants");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const firstName = body?.firstName?.trim() || null;
  const lastName = body?.lastName?.trim() || null;
  const email = body?.email?.trim();
  const role = ROLES.includes(body?.role) ? body.role : "enseignant";

  if (!email) {
    return NextResponse.json({ error: "L'adresse e-mail est obligatoire." }, { status: 400 });
  }

  let { data: teacher } = await auth.admin
    .from("teachers")
    .select("id, email, first_name, last_name")
    .ilike("email", email)
    .maybeSingle();

  if (!teacher) {
    const { data: cree, error: insertError } = await auth.admin
      .from("teachers")
      .insert({ first_name: firstName, last_name: lastName, email, role })
      .select("id, email, first_name, last_name")
      .single();
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    teacher = cree;
  }

  const { error: inviteError } = await envoyerInvitationEnseignant(auth.admin, {
    email: teacher.email,
    firstName: teacher.first_name,
    lastName: teacher.last_name,
    teacherId: teacher.id,
  });

  if (inviteError) {
    if (/already been registered/i.test(inviteError.message)) {
      return NextResponse.json(
        {
          error:
            "Ce compte a déjà été activé (mot de passe défini) : proposez plutôt le lien « mot de passe oublié ».",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: `Envoi impossible : ${inviteError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: teacher.id });
}

// Active / désactive un compte enseignant, ou change son rôle.
export async function PATCH(request) {
  const auth = await requirePermission(request, "enseignants");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (!id) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });

  const update = {};
  if (typeof body.active === "boolean") update.active = body.active;
  if (ROLES.includes(body.role)) update.role = body.role;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }

  const { error } = await auth.admin.from("teachers").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
