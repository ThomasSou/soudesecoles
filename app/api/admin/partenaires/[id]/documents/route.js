import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

const PERM = "avantages";
const MAX_BYTES = 10 * 1024 * 1024; // 10 Mo (contrats scannés)

function decodeDataUrl(dataUrl) {
  const match = /^data:(application\/pdf|image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > MAX_BYTES) return null;
  const ext = contentType === "application/pdf" ? "pdf" : contentType.split("/")[1].replace("jpeg", "jpg");
  return { contentType, buffer, ext };
}

// POST : le bureau dépose un document (contrat, convention...) pour le
// partenaire. Fichier envoyé en data URL (image ou PDF, 10 Mo max), stocké
// dans le bucket privé "partenaire-documents".
export async function POST(request, { params }) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const body = await request.json().catch(() => null);
  const titre = body?.titre?.trim();
  if (!titre) return NextResponse.json({ error: "Le titre du document est obligatoire." }, { status: 400 });

  const fichier = decodeDataUrl(body?.fichierDataUrl);
  if (!fichier) {
    return NextResponse.json(
      { error: "Fichier invalide ou trop lourd (image ou PDF, 10 Mo maximum)." },
      { status: 400 }
    );
  }

  const chemin = `${params.id}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${fichier.ext}`;
  const { error: uploadError } = await admin.storage
    .from("partenaire-documents")
    .upload(chemin, fichier.buffer, { contentType: fichier.contentType, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data, error } = await admin
    .from("partenaire_documents")
    .insert({
      partenaire_id: params.id,
      titre,
      description: body?.description?.trim() || null,
      chemin,
      type_mime: fichier.contentType,
      taille_octets: fichier.buffer.length,
      depose_par: auth.parent.id,
    })
    .select()
    .single();

  if (error) {
    // On tente de nettoyer le fichier orphelin, sans bloquer sur l'échec.
    await admin.storage.from("partenaire-documents").remove([chemin]).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, document: data });
}
