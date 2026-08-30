import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Détail par destinataire d'une campagne (fait technique de livraison :
// adresse, prénom, statut, canal, date). Alimenté au fil de l'envoi par
// app/lib/emailCampagne.js. Pas d'ouverture ni de clic par personne.
export async function GET(request) {
  const auth = await requirePermission(request, "emails");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Campagne manquante." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("email_campaign_recipients")
    .select("email, prenom, statut, canal, envoye_le")
    .eq("campaign_id", id)
    .order("envoye_le", { ascending: true })
    .limit(2000);

  if (error) {
    // Table pas encore créée (migration 0033) : on renvoie une liste vide
    // plutôt qu'une erreur, l'historique reste consultable.
    return NextResponse.json({ ok: true, destinataires: [], indisponible: true });
  }

  return NextResponse.json({ ok: true, destinataires: data || [] });
}
