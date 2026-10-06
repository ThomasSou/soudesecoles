import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { envoyerInvitationEnseignant } from "../../../../lib/invitationsEnseignants";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const ROLES = ["enseignant", "direction"];

// Liste des comptes enseignants, avec l'état d'activation du compte de
// connexion. auth_user_id est posé dès l'ENVOI de l'invitation (le compte est
// créé à ce moment-là) : il ne prouve pas que la personne a activé son
// compte. Seule une première connexion (last_sign_in_at) le prouve.
export async function GET(request) {
  const auth = await requirePermission(request, "enseignants");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data, error }, usersRes] = await Promise.all([
    auth.admin
      .from("teachers")
      .select("id, first_name, last_name, email, role, active, auth_user_id, invited_at, created_at")
      .order("last_name"),
    auth.admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const dernierConnexionParUser = new Map(
    (usersRes?.data?.users || []).map((u) => [u.id, u.last_sign_in_at || null])
  );

  const comptes = (data || []).map((t) => ({
    id: t.id,
    firstName: t.first_name,
    lastName: t.last_name,
    email: t.email,
    role: t.role,
    active: t.active,
    compteActive: Boolean(t.auth_user_id && dernierConnexionParUser.get(t.auth_user_id)),
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

  const { data: inviteData, error: inviteError } = await envoyerInvitationEnseignant(auth.admin, {
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
            "Ce compte existe déjà : proposez plutôt le lien « mot de passe oublié ».",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: `Envoi impossible : ${inviteError.message}` }, { status: 500 });
  }

  // D1 : la personne avait déjà un compte (parent / bureau). La fiche
  // enseignant y a été rattachée, aucun e-mail n'est parti.
  if (inviteData?.compteExistant) {
    return NextResponse.json({
      ok: true,
      id: teacher.id,
      compteExistant: true,
      message:
        "Cette personne a déjà un compte sur le site : la fiche enseignant y a été rattachée. Elle se connecte avec son mot de passe habituel — pas d'e-mail d'invitation envoyé.",
    });
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

// Supprime définitivement un accès enseignant. Refusé dès que la personne a
// des devis, factures ou RIB enregistrés : ils partiraient avec elle
// (suppression en cascade) et la comptabilité perdrait son historique — il
// faut alors se contenter de désactiver le compte. Le compte de connexion
// n'est supprimé que s'il n'a jamais servi et n'appartient à aucun parent.
export async function DELETE(request) {
  const auth = await requirePermission(request, "enseignants");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (!id) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });

  const { data: teacher } = await auth.admin
    .from("teachers")
    .select("id, auth_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!teacher) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });

  const compter = async (table) => {
    const { count } = await auth.admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("teacher_id", id);
    return count || 0;
  };
  const [devis, factures, ribs] = await Promise.all([
    compter("teacher_quotes"),
    compter("teacher_invoices"),
    compter("teacher_ribs"),
  ]);
  if (devis + factures + ribs > 0) {
    return NextResponse.json(
      {
        error:
          "Ce compte a déjà des devis, factures ou RIB enregistrés : le supprimer les effacerait de la comptabilité. Désactivez-le plutôt.",
      },
      { status: 409 }
    );
  }

  const { error } = await auth.admin.from("teachers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (teacher.auth_user_id) {
    const [{ data: user }, { data: parentLie }] = await Promise.all([
      auth.admin.auth.admin.getUserById(teacher.auth_user_id),
      auth.admin.from("parents").select("id").eq("auth_user_id", teacher.auth_user_id).maybeSingle(),
    ]);
    if (user?.user && !user.user.last_sign_in_at && !parentLie) {
      await auth.admin.auth.admin.deleteUser(teacher.auth_user_id);
    }
  }

  return NextResponse.json({ ok: true });
}
