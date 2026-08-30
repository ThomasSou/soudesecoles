import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

const PERM = "partenaires";

// GET : URL signée (5 min) vers l'image du message, pour l'aperçu bureau.
export async function GET(request, { params }) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: message } = await auth.admin
    .from("partenaire_messages")
    .select("image_chemin")
    .eq("id", params.id)
    .maybeSingle();

  if (!message) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
  if (!message.image_chemin) return NextResponse.json({ ok: true, url: null });

  const { data, error } = await auth.admin.storage
    .from("partenaire-messages")
    .createSignedUrl(message.image_chemin, 300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, url: data.signedUrl });
}

// PATCH : le bureau valide ou refuse un message soumis.
//   { decision: "valide" }
//   { decision: "refuse", motif: "..." }
// La publication effective (statut 'publie', publie_le) est faite plus tard
// par le chantier e-mailing mensuel — pas ici.
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const decision = body?.decision;

  const { data: message } = await auth.admin
    .from("partenaire_messages")
    .select("statut")
    .eq("id", params.id)
    .maybeSingle();

  if (!message) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
  if (!["soumis", "valide", "refuse"].includes(message.statut)) {
    return NextResponse.json({ error: "Ce message n'est pas au stade modération." }, { status: 409 });
  }

  let update;
  if (decision === "valide") {
    update = {
      statut: "valide",
      valide_le: new Date().toISOString(),
      valide_par: auth.parent.id,
      motif_refus: null,
      updated_at: new Date().toISOString(),
    };
  } else if (decision === "refuse") {
    const motif = body?.motif?.trim();
    if (!motif) return NextResponse.json({ error: "Indiquez un motif de refus." }, { status: 400 });
    update = {
      statut: "refuse",
      motif_refus: motif,
      valide_le: new Date().toISOString(),
      valide_par: auth.parent.id,
      updated_at: new Date().toISOString(),
    };
  } else {
    return NextResponse.json({ error: "Décision invalide (valide ou refuse)." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("partenaire_messages")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, message: data });
}
