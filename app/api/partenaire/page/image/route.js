import { NextResponse } from "next/server";
import { resolvePartenaireSession } from "../../../../lib/partenaires";
import { BUCKET_PAGES } from "../../../../lib/partenairePages";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// POST : dépose une photo dans le dossier du partenaire connecté (déduit du
// jeton, jamais du client) et renvoie son adresse publique.
export async function POST(request) {
  const session = await resolvePartenaireSession(request);
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });
  const { admin, partenaire } = session;

  const body = await request.json().catch(() => null);
  const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(body?.imageDataUrl || "");
  const ext = m && TYPES[m[1]];
  if (!ext) return NextResponse.json({ error: "Format d'image non accepté (JPEG, PNG ou WebP)." }, { status: 400 });
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > MAX_BYTES) return NextResponse.json({ error: "Image trop lourde (4 Mo maximum)." }, { status: 400 });

  const chemin = `${partenaire.id}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const { error } = await admin.storage.from(BUCKET_PAGES).upload(chemin, buffer, { contentType: m[1], upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = admin.storage.from(BUCKET_PAGES).getPublicUrl(chemin);
  return NextResponse.json({ ok: true, url: data.publicUrl });
}
