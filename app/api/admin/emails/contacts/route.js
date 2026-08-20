import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { currentSchoolYear, isMembershipValid } from "../../../../lib/anneeScolaire";

// Liste légère des contacts (parents avec e-mail), pour le sélecteur
// "Aperçu avec..." de l'éditeur d'e-mails — permet de vérifier que les
// champs dynamiques (prénom, statut d'adhésion) s'affichent bien pour une
// personne précise, comme le permettait Yapla.
export async function GET(request) {
  const auth = await requirePermission(request, "emails");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [parentsRes, membershipsRes] = await Promise.all([
    auth.admin.from("parents").select("id, family_id, first_name, last_name, email, email_opt_out"),
    auth.admin.from("memberships").select("family_id, school_year, paid_at"),
  ]);

  const annee = currentSchoolYear();
  const memberships = membershipsRes.data || [];

  const contacts = (parentsRes.data || [])
    .filter((p) => p.email)
    .map((p) => {
      const adhesion = memberships.find((m) => m.family_id === p.family_id && m.school_year === annee);
      return {
        parentId: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        email: p.email,
        adherent: isMembershipValid(adhesion),
        optedOut: p.email_opt_out,
      };
    })
    .sort((a, b) => `${a.firstName}${a.lastName}`.localeCompare(`${b.firstName}${b.lastName}`));

  return NextResponse.json({ ok: true, contacts });
}
