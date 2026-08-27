import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import { envoyerInvitation } from "../../../lib/invitations";

export async function GET(request) {
  const auth = await requirePermission(request, "familles");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = auth.admin;

  const [familiesRes, parentsRes, childrenRes, membershipsRes, usersRes, invitationsRes] =
    await Promise.all([
      admin.from("families").select("*").order("created_at"),
      admin.from("parents").select("*"),
      admin.from("children").select("*"),
      admin.from("memberships").select("*"),
      admin.auth.admin.listUsers({ perPage: 1000 }),
      admin
        .from("invitations")
        .select("email, sent_at, opened_at, clicked_at, bounced_at")
        .order("sent_at", { ascending: false }),
    ]);

  if (familiesRes.error) {
    return NextResponse.json(
      { error: familiesRes.error.message },
      { status: 500 }
    );
  }

  // Une fiche `parents` existe des la creation/l'import de la famille,
  // independamment du compte de connexion (auth.users) : ce n'est donc pas
  // un bon indicateur pour savoir si l'invitation a abouti. On croise avec
  // auth.users pour savoir si le compte a vraiment ete active (connexion
  // effective au moins une fois), ce que listUsers() expose sans avoir
  // besoin d'une requete SQL directe sur auth.users.
  const usersByEmail = new Map(
    (usersRes?.data?.users || []).map((u) => [
      (u.email || "").toLowerCase(),
      u,
    ])
  );

  // Dernier envoi via Sender pour chaque adresse (le premier rencontré,
  // puisque la liste est triée du plus récent au plus ancien) : donne la
  // visibilité ouverte/cliquée demandée, en plus du statut "compte activé"
  // ci-dessus. Reste vide tant que Sender n'est pas configuré.
  const dernierEnvoiParEmail = new Map();
  for (const inv of invitationsRes?.data || []) {
    const cle = (inv.email || "").toLowerCase();
    if (!dernierEnvoiParEmail.has(cle)) dernierEnvoiParEmail.set(cle, inv);
  }

  const decoreParent = (p) => {
    const u = usersByEmail.get((p.email || "").toLowerCase());
    const envoi = dernierEnvoiParEmail.get((p.email || "").toLowerCase());
    return {
      ...p,
      authActivated: Boolean(u?.last_sign_in_at || u?.confirmed_at),
      authInvitedAt: u?.invited_at || null,
      invitationEnvoyeeLe: envoi?.sent_at || null,
      invitationOuverteLe: envoi?.opened_at || null,
      invitationCliqueeLe: envoi?.clicked_at || null,
      invitationRebondLe: envoi?.bounced_at || null,
    };
  };

  const familles = (familiesRes.data || []).map((f) => ({
    ...f,
    parents: (parentsRes.data || [])
      .filter((p) => p.family_id === f.id)
      .map(decoreParent),
    children: (childrenRes.data || []).filter((c) => c.family_id === f.id),
    memberships: (membershipsRes.data || []).filter(
      (m) => m.family_id === f.id
    ),
  }));

  return NextResponse.json({ familles });
}

// Ajoute un parent à une famille EXISTANTE. Deux cas, selon que `parentId`
// est fourni ou non :
// - sans parentId : crée une nouvelle fiche (utilisé notamment pour les
//   familles importées dont l'invitation initiale avait échoué : on ne
//   recrée pas la famille, on ajoute juste un parent) ;
// - avec parentId : complète une fiche "sans compte" déjà existante (parent
//   sans e-mail au départ) en lui ajoutant une adresse, sans créer de
//   doublon.
// L'e-mail est facultatif : sans adresse, la fiche est créée/mise à jour
// sans tentative d'invitation (parent sans compte assumé).
export async function POST(request) {
  const auth = await requirePermission(request, "familles");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = auth.admin;

  const { familyId, parentId, firstName, lastName, email, phone, role } =
    await request.json();

  const trimmedEmail = email?.trim() || null;

  if (!familyId) {
    return NextResponse.json({ error: "Famille obligatoire." }, { status: 400 });
  }
  if (!parentId && !firstName?.trim() && !lastName?.trim()) {
    return NextResponse.json({ error: "Prénom ou nom obligatoire." }, { status: 400 });
  }

  const { data: famille } = await admin
    .from("families")
    .select("id")
    .eq("id", familyId)
    .maybeSingle();

  if (!famille) {
    return NextResponse.json({ error: "Famille introuvable." }, { status: 404 });
  }

  if (trimmedEmail) {
    const { data: dejaParent } = await admin
      .from("parents")
      .select("id, family_id")
      .eq("email", trimmedEmail)
      .maybeSingle();

    if (dejaParent && dejaParent.id !== parentId) {
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
  }

  let parent;
  if (parentId) {
    // Complète une fiche "sans compte" existante.
    const { data: existante } = await admin
      .from("parents")
      .select("id, family_id, auth_user_id, first_name, last_name")
      .eq("id", parentId)
      .maybeSingle();

    if (!existante || existante.family_id !== familyId) {
      return NextResponse.json({ error: "Fiche parent introuvable pour cette famille." }, { status: 404 });
    }
    if (existante.auth_user_id) {
      return NextResponse.json({ error: "Ce parent a déjà un compte." }, { status: 409 });
    }

    const { data: maj, error: majError } = await admin
      .from("parents")
      .update({
        email: trimmedEmail,
        first_name: firstName?.trim() || existante.first_name,
        last_name: lastName?.trim() || existante.last_name,
        phone: phone?.trim() || null,
      })
      .eq("id", parentId)
      .select()
      .single();

    if (majError) return NextResponse.json({ error: majError.message }, { status: 500 });
    parent = maj;
  } else {
    const { data: nouveau, error: creationError } = await admin
      .from("parents")
      .insert({
        family_id: familyId,
        first_name: firstName?.trim() || null,
        last_name: lastName?.trim() || null,
        email: trimmedEmail,
        phone: phone?.trim() || null,
        role: role || "parent",
      })
      .select()
      .single();

    if (creationError) return NextResponse.json({ error: creationError.message }, { status: 500 });
    parent = nouveau;
  }

  if (!trimmedEmail) {
    // Parent sans adresse : pas d'invitation possible, on s'arrête là.
    return NextResponse.json({ ok: true, invitationEnvoyee: false });
  }

  const { error: inviteError } = await envoyerInvitation(admin, {
    email: parent.email,
    firstName: parent.first_name,
    lastName: parent.last_name,
    parentId: parent.id,
  });

  if (!inviteError) {
    return NextResponse.json({ ok: true, invitationEnvoyee: true });
  }

  // Le compte Auth peut déjà exister sans que rien ne le référence côté
  // fiche (invitation partie ailleurs sans fiche, ou fiche créée après
  // coup) : on retrouve ce compte et on relie quand même la fiche, plutôt
  // que d'échouer alors que le parent a en réalité déjà un accès.
  if (/already been registered/i.test(inviteError.message)) {
    const { data: liste } = await admin.auth.admin.listUsers();
    const existant = (liste?.users || []).find(
      (u) => u.email?.toLowerCase() === parent.email.toLowerCase()
    );
    if (existant) {
      await admin.from("parents").update({ auth_user_id: existant.id }).eq("id", parent.id);
    }
    return NextResponse.json({ ok: true, invitationEnvoyee: false });
  }

  return NextResponse.json(
    { error: `Invitation impossible : ${inviteError.message}` },
    { status: 500 }
  );
}
