import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";
import { envoyerInvitationPartenaire } from "../../../../../lib/partenaires";

export const dynamic = "force-dynamic";

const PERM = "partenaires";

// Envoie (ou renvoie) au partenaire l'invitation à activer son espace :
// même circuit que pour les familles (jeton maison + Sender si configuré,
// sinon inviteUserByEmail). Le partenaire doit avoir une adresse e-mail.
export async function POST(request, { params }) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const { data: partenaire } = await admin
    .from("partenaires")
    .select("id, nom, email, auth_user_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!partenaire) return NextResponse.json({ error: "Partenaire introuvable." }, { status: 404 });
  if (!partenaire.email) {
    return NextResponse.json(
      { error: "Renseignez d'abord l'adresse e-mail du partenaire." },
      { status: 400 }
    );
  }

  const { error: inviteError } = await envoyerInvitationPartenaire(admin, {
    email: partenaire.email,
    nom: partenaire.nom,
    partenaireId: partenaire.id,
  });

  if (inviteError) {
    if (/already been registered/i.test(inviteError.message)) {
      // Compte déjà activé : on relie quand même la fiche si besoin.
      const { data: liste } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const existant = (liste?.users || []).find(
        (u) => u.email?.toLowerCase() === partenaire.email.toLowerCase()
      );
      if (existant && !partenaire.auth_user_id) {
        await admin.from("partenaires").update({ auth_user_id: existant.id }).eq("id", partenaire.id);
      }
      return NextResponse.json(
        {
          error:
            "Ce compte a déjà été activé (mot de passe défini). Proposez plutôt le lien « mot de passe oublié ».",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: `Envoi impossible : ${inviteError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
