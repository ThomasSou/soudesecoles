import { NextResponse } from "next/server";
import { createAdminClient } from "../../lib/supabaseServerAdmin";

// Route de secours : utilisee uniquement quand une personne est deja
// authentifiee (compte cree via invitation admin ou demande approuvee) mais
// que sa fiche famille n'existe pas encore cote base (ex. compte cree
// manuellement sans passer par le script d'import). Le parcours normal
// est l'import admin (scripts/import-familles.mjs), qui cree la famille
// ET invite le parent par e-mail en une seule etape.
// Recoit le token d'acces de la personne connectee, verifie son identite,
// puis cree la famille + le parent + les enfants avec la cle service role
// (les policies RLS ne permettent pas l'ecriture directe depuis le navigateur,
// ce qui evite qu'un utilisateur puisse s'inserer dans une famille arbitraire).
export async function POST(request) {
  const body = await request.json();
  const { accessToken, firstName, lastName, phone, addressLine, postalCode, city, children } = body;

  if (!accessToken) {
    return NextResponse.json({ error: "Non authentifie." }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }
  const user = userData.user;

  // Un parent ne peut avoir qu'une seule fiche : si elle existe deja, on arrete.
  const { data: existingParent } = await admin
    .from("parents")
    .select("id, family_id")
    .eq("id", user.id)
    .maybeSingle();

  if (existingParent?.family_id) {
    return NextResponse.json({ error: "Ce compte est deja rattache a une famille." }, { status: 409 });
  }

  const schoolYear = process.env.NEXT_PUBLIC_SCHOOL_YEAR || "2025-2026";

  const { data: family, error: familyError } = await admin
    .from("families")
    .insert({
      address_line: addressLine || null,
      postal_code: postalCode || null,
      city: city || null,
      status_current_year: "non_adherent",
    })
    .select()
    .single();

  if (familyError) {
    return NextResponse.json({ error: familyError.message }, { status: 500 });
  }

  const { error: parentError } = await admin.from("parents").upsert({
    id: user.id,
    family_id: family.id,
    first_name: firstName || null,
    last_name: lastName || null,
    email: user.email,
    phone: phone || null,
    role: "parent",
  });

  if (parentError) {
    return NextResponse.json({ error: parentError.message }, { status: 500 });
  }

  const childRows = (children || [])
    .filter((c) => c.firstName && c.lastName)
    .map((c) => ({
      family_id: family.id,
      first_name: c.firstName,
      last_name: c.lastName,
      class_level: c.classLevel || null,
      teacher_name: c.teacherName || null,
      school_year: schoolYear,
    }));

  if (childRows.length > 0) {
    const { error: childrenError } = await admin.from("children").insert(childRows);
    if (childrenError) {
      return NextResponse.json({ error: childrenError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, familyId: family.id });
}
