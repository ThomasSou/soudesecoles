import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://soumontmerle.netlify.app";

export async function GET(request) {
  const auth = await requirePermission(request, "familles");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = auth.admin;

  const [familiesRes, parentsRes, childrenRes, membershipsRes] =
    await Promise.all([
      admin.from("families").select("*").order("created_at"),
      admin.from("parents").select("*"),
      admin.from("children").select("*"),
      admin.from("memberships").select("*"),
    ]);

  if (familiesRes.error) {
    return NextResponse.json(
      { error: familiesRes.error.message },
      { status: 500 }
    );
  }

  const familles = (familiesRes.data || []).map((f) => ({
    ...f,
    parents: (parentsRes.data || []).filter((p) => p.family_id === f.id),
    children: (childrenRes.data || []).filter((c) => c.family_id === f.id),
    memberships: (membershipsRes.data || []).filter(
      (m) => m.family_id === f.id
    ),
  }));

  return NextResponse.json({ familles });
}

// Rattache un parent à une famille EXISTANTE et lui envoie une invitation.
// Utilisé notamment pour les familles importées dont l'invitation initiale
// avait échoué : on ne recrée pas la famille, on ajoute juste le compte.
export async function POST(request) {
  const auth = await requirePermission(request, "familles");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = auth.admin;

  const { familyId, firstName, lastName, email, phone, role } =
    await request.json();

  if (!familyId || !email?.trim()) {
    return NextResponse.json(
      { error: "Famille et adresse e-mail obligatoires." },
      { status: 400 }
    );
  }

  const { data: famille } = await admin
    .from("families")
    .select("id")
    .eq("id", familyId)
    .maybeSingle();

  if (!famille) {
    return NextResponse.json({ error: "Famille introuvable." }, { status: 404 });
  }

  // Le compte existe-t-il déjà côté Auth ?
  const { data: dejaParent } = await admin
    .from("parents")
    .select("id, family_id")
    .eq("email", email.trim())
    .maybeSingle();

  if (dejaParent) {
    return NextResponse.json(
      {
        error:
          dejaParent.family_id === familyId
            ? "Ce parent est déjà rattaché à cette famille."
            : "Cette adresse e-mail est déjà rattachée à une autre famille.",
      },
      { status: 409 }
    );
  }

  let userId;
  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email.trim(), {
      redirectTo: `${SITE_URL}/activer-compte`,
    });

  if (inviteError) {
    // Le compte Auth peut déjà exister sans fiche parent (invitation partie
    // sans que la fiche soit créée) : on le retrouve pour le rattacher.
    if (/already been registered/i.test(inviteError.message)) {
      const { data: liste } = await admin.auth.admin.listUsers();
      const existant = (liste?.users || []).find(
        (u) => u.email?.toLowerCase() === email.trim().toLowerCase()
      );
      if (!existant) {
        return NextResponse.json(
          { error: `Invitation impossible : ${inviteError.message}` },
          { status: 500 }
        );
      }
      userId = existant.id;
    } else {
      return NextResponse.json(
        { error: `Invitation impossible : ${inviteError.message}` },
        { status: 500 }
      );
    }
  } else {
    userId = invited.user.id;
  }

  const { error: parentError } = await admin.from("parents").upsert({
    id: userId,
    family_id: familyId,
    first_name: firstName?.trim() || null,
    last_name: lastName?.trim() || null,
    email: email.trim(),
    phone: phone?.trim() || null,
    role: role || "parent",
  });

  if (parentError) {
    return NextResponse.json({ error: parentError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    invitationEnvoyee: !inviteError,
  });
}
