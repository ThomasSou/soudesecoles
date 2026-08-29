import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

const PERM = "avantages";

// GET : URL signée (5 min) vers le fichier, pour que le bureau puisse le
// relire. DELETE : retire le document (ligne + fichier).
export async function GET(request, { params }) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: doc } = await auth.admin
    .from("partenaire_documents")
    .select("chemin")
    .eq("id", params.docId)
    .eq("partenaire_id", params.id)
    .maybeSingle();

  if (!doc) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  const { data, error } = await auth.admin.storage
    .from("partenaire-documents")
    .createSignedUrl(doc.chemin, 300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, url: data.signedUrl });
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const { data: doc } = await admin
    .from("partenaire_documents")
    .select("chemin")
    .eq("id", params.docId)
    .eq("partenaire_id", params.id)
    .maybeSingle();

  if (!doc) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  await admin.storage.from("partenaire-documents").remove([doc.chemin]).catch(() => {});
  const { error } = await admin.from("partenaire_documents").delete().eq("id", params.docId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
