import { NextResponse } from "next/server";
import { createAdminClient } from "../../lib/supabaseServerAdmin";

// Route temporaire, protegee par un jeton partage (ADMIN_IMPORT_TOKEN),
// utilisee UNE FOIS pour tester le mecanisme d'import + invitation avec
// les familles du bureau. A supprimer une fois le test valide (le vrai
// import se fera via scripts/import-familles.mjs, execute depuis un
// environnement serveur qui a acces reseau a Supabase).
export async function POST(request) {
  const token = request.headers.get("x-admin-token");
  if (!token || token !== process.env.ADMIN_IMPORT_TOKEN) {
    return NextResponse.json({ error: "Non autorise." }, { status: 401 });
  }

  const { families, schoolYear } = await request.json();
  const admin = createAdminClient();

  const logs = [];
  let familiesCreated = 0, parentsInvited = 0, parentsSkipped = 0, childrenCreated = 0;

  for (const fam of families) {
    const { data: family, error: familyError } = await admin
      .from("families")
      .insert({
        address_line: fam.addressLine || null,
        postal_code: fam.postalCode || null,
        city: fam.city || null,
        status_current_year: "non_adherent",
      })
      .select()
      .single();

    if (familyError) {
      logs.push(`Erreur creation famille (${fam.parents?.[0]?.lastName}) : ${familyError.message}`);
      continue;
    }
    familiesCreated++;
    logs.push(`Famille creee : ${fam.parents?.[0]?.lastName} (${family.id})`);

    for (const parent of fam.parents || []) {
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(parent.email);
      if (inviteError) {
        logs.push(`  Parent ${parent.firstName} ${parent.lastName} (${parent.email}) NON invite : ${inviteError.message}`);
        parentsSkipped++;
        continue;
      }
      const { error: parentError } = await admin.from("parents").upsert({
        id: invited.user.id,
        family_id: family.id,
        first_name: parent.firstName || null,
        last_name: parent.lastName || null,
        email: parent.email,
        phone: parent.phone || null,
        role: "parent",
      });
      if (parentError) {
        logs.push(`  Erreur creation fiche parent ${parent.email} : ${parentError.message}`);
        continue;
      }
      parentsInvited++;
      logs.push(`  Invitation envoyee a ${parent.email}`);
    }

    const childRows = (fam.children || [])
      .filter((c) => c.firstName && c.lastName)
      .map((c) => ({
        family_id: family.id,
        first_name: c.firstName,
        last_name: c.lastName,
        class_level: c.classLevel || null,
        teacher_name: c.teacherName || null,
        school_year: fam.schoolYear || schoolYear || "2025-2026",
      }));

    if (childRows.length > 0) {
      const { error: childrenError } = await admin.from("children").insert(childRows);
      if (childrenError) {
        logs.push(`  Erreur creation enfants : ${childrenError.message}`);
      } else {
        childrenCreated += childRows.length;
        logs.push(`  ${childRows.length} enfant(s) cree(s)`);
      }
    }
  }

  logs.push(`--- Resume --- Familles: ${familiesCreated} | Parents invites: ${parentsInvited} | Parents non invites: ${parentsSkipped} | Enfants: ${childrenCreated}`);

  return NextResponse.json({ logs, familiesCreated, parentsInvited, parentsSkipped, childrenCreated });
}
