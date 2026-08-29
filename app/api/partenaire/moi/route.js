import { NextResponse } from "next/server";
import { resolvePartenaireSession, statutPeriodePartenaire } from "../../../lib/partenaires";

export const dynamic = "force-dynamic";

// Tout ce dont l'espace partenaire connecté a besoin, en un seul appel
// (comme /espace-adherent charge sa famille d'un coup) : profil, période
// d'adhésion, paiements (lecture seule), avantages offerts + nombre
// d'utilisations, documents déposés par le bureau.
export async function GET(request) {
  const session = await resolvePartenaireSession(request);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });
  const { admin, partenaire } = session;

  const [{ data: periodes }, { data: paiements }, { data: avantages }, { data: documents }] =
    await Promise.all([
      admin.from("partenaire_periodes").select("*").eq("partenaire_id", partenaire.id).order("debut", { ascending: false }),
      admin.from("partenaire_paiements").select("id, montant_cents, recu_le, moyen, reference, note").eq("partenaire_id", partenaire.id).order("recu_le", { ascending: false }),
      admin.from("avantages").select("*").eq("partenaire_id", partenaire.id).order("created_at", { ascending: false }),
      admin.from("partenaire_documents").select("id, titre, description, type_mime, taille_octets, depose_le").eq("partenaire_id", partenaire.id).order("depose_le", { ascending: false }),
    ]);

  const ids = (avantages || []).map((a) => a.id);
  const utilisationsParAvantage = {};
  if (ids.length) {
    const { data: utilisations } = await admin
      .from("avantage_utilisations")
      .select("avantage_id")
      .in("avantage_id", ids);
    for (const u of utilisations || []) {
      utilisationsParAvantage[u.avantage_id] = (utilisationsParAvantage[u.avantage_id] || 0) + 1;
    }
  }

  const { aJour, periodeCourante } = statutPeriodePartenaire(periodes || []);

  return NextResponse.json({
    ok: true,
    partenaire: {
      id: partenaire.id,
      nom: partenaire.nom,
      email: partenaire.email,
      contact_nom: partenaire.contact_nom,
      telephone: partenaire.telephone,
      adresse: partenaire.adresse,
      code_postal: partenaire.code_postal,
      ville: partenaire.ville,
      site_web: partenaire.site_web,
    },
    aJour,
    periodeCourante,
    periodes: periodes || [],
    paiements: paiements || [],
    avantages: (avantages || []).map((a) => ({
      ...a,
      utilisations: utilisationsParAvantage[a.id] || 0,
    })),
    documents: documents || [],
  });
}
