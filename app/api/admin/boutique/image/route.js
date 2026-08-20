import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

const MAX_BYTES = 4 * 1024 * 1024; // 4 Mo

// Dépose une image de produit dans le bucket public "shop-images"
// (même principe que l'upload d'images de l'éditeur d'e-mails).
export async function POST(request) {
  const auth = await requirePermission(request, "boutique");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { dataUrl, filename } = await request.json();
  const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) {
    return NextResponse.json({ error: "Fichier image invalide." }, { status: 400 });
  }

  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image trop lourde (4 Mo maximum)." }, { status: 400 });
  }

  const ext = (contentType.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const path = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;

  const { error } = await auth.admin.storage
    .from("shop-images")
    .upload(path, buffer, { contentType, upsert: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = auth.admin.storage.from("shop-images").getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl });
}
