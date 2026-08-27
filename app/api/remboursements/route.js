import { NextResponse } from "next/server";
import { createAdminClient } from "../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8 Mo (factures scannées, RIB)
const CATEGORIES = ["manifestation", "investissement", "fonctionnement", "autre"];

function decodeDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9+.-]+|application\/pdf);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > MAX_BYTES) return null;
  const ext = contentType === "application/pdf" ? "pdf" : contentType.split("/")[1].replace("jpeg", "jpg");
  return { contentType, buffer, ext };
}

// Un parent connecté dépose une demande de remboursement (manifestation,
// investissement général, frais de fonctionnement, ou autre), avec facture
// obligatoire et RIB facultatif. Les fichiers vont dans le bucket privé
// "remboursements" (jamais d'URL publique, contrairement aux images
// boutique/e-mails) : seul le back-office peut ensuite les consulter, via
// une URL signée à courte durée de vie.
export async function POST(request) {
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  const { data: parent } = await admin
    .from("parents")
    .select("id, family_id")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (!parent?.family_id) {
    return NextResponse.json({ error: "Profil famille introuvable." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const category = body?.category;
  const eventSlug = body?.eventSlug || null;
  const eventName = body?.eventName || null;
  const description = body?.description?.trim() || null;
  const amount = Number(body?.amount);

  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });
  }
  if (category === "manifestation" && !eventSlug) {
    return NextResponse.json({ error: "Choisissez la manifestation concernée." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Le montant doit être supérieur à 0." }, { status: 400 });
  }

  const invoice = decodeDataUrl(body?.invoiceDataUrl);
  if (!invoice) {
    return NextResponse.json(
      { error: "Facture invalide ou trop lourde (image ou PDF, 8 Mo maximum)." },
      { status: 400 }
    );
  }

  const prefix = `${parent.family_id}/${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const invoicePath = `${prefix}-facture.${invoice.ext}`;

  const { error: invoiceUploadError } = await admin.storage
    .from("remboursements")
    .upload(invoicePath, invoice.buffer, { contentType: invoice.contentType, upsert: false });
  if (invoiceUploadError) {
    return NextResponse.json({ error: invoiceUploadError.message }, { status: 500 });
  }

  let ribPath = null;
  if (body?.ribDataUrl) {
    const rib = decodeDataUrl(body.ribDataUrl);
    if (!rib) {
      return NextResponse.json(
        { error: "RIB invalide ou trop lourd (image ou PDF, 8 Mo maximum)." },
        { status: 400 }
      );
    }
    ribPath = `${prefix}-rib.${rib.ext}`;
    const { error: ribUploadError } = await admin.storage
      .from("remboursements")
      .upload(ribPath, rib.buffer, { contentType: rib.contentType, upsert: false });
    if (ribUploadError) {
      return NextResponse.json({ error: ribUploadError.message }, { status: 500 });
    }
  }

  const { error: insertError } = await admin.from("reimbursement_requests").insert({
    family_id: parent.family_id,
    parent_id: parent.id,
    category,
    event_slug: category === "manifestation" ? eventSlug : null,
    event_name: category === "manifestation" ? eventName : null,
    description,
    amount_cents: Math.round(amount * 100),
    invoice_path: invoicePath,
    rib_path: ribPath,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// Liste des demandes du parent connecté (toutes familles confondues n'a pas
// de sens ici : uniquement celles de sa propre famille).
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  const { data: parent } = await admin
    .from("parents")
    .select("id, family_id")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (!parent?.family_id) {
    return NextResponse.json({ ok: true, demandes: [] });
  }

  const { data, error } = await admin
    .from("reimbursement_requests")
    .select("id, category, event_name, description, amount_cents, status, admin_note, created_at, processed_at")
    .eq("family_id", parent.family_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, demandes: data || [] });
}
