import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_BYTES = 4 * 1024 * 1024; // 4 Mo

// Dépose l'image d'un événement dans le bucket public "shop-images" (déjà
// utilisé pour la boutique), sous le préfixe evenements/.
export async function POST(request) {
  const auth = await requirePermission(request, "evenements");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { dataUrl } = await request.json().catch(() => ({}));
  const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return NextResponse.json({ error: "Fichier image invalide." }, { status: 400 });

  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image trop lourde (4 Mo maximum)." }, { status: 400 });
  }

  const ext = (contentType.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const path = `evenements/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const { error } = await auth.admin.storage
    .from("shop-images")
    .upload(path, buffer, { contentType, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = auth.admin.storage.from("shop-images").getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl });
}
