import { NextResponse } from "next/server";
import { resolvePartenaireSession } from "../../../../lib/partenaires";

export const dynamic = "force-dynamic";

// URL signée (5 min) vers un document déposé par le bureau, réservée au
// partenaire concerné (on vérifie que le document lui appartient bien).
export async function GET(request, { params }) {
  const session = await resolvePartenaireSession(request);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });
  const { admin, partenaire } = session;

  const { data: doc } = await admin
    .from("partenaire_documents")
    .select("chemin")
    .eq("id", params.id)
    .eq("partenaire_id", partenaire.id)
    .maybeSingle();

  if (!doc) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  const { data, error } = await admin.storage
    .from("partenaire-documents")
    .createSignedUrl(doc.chemin, 300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, url: data.signedUrl });
}
