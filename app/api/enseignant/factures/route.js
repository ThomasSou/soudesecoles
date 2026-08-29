import { NextResponse } from "next/server";
import { requireEnseignant } from "../../../lib/enseignantAuth";
import { televerserFichier } from "../../../lib/enseignantFichiers";
import { currentSchoolYear } from "../../../lib/anneeScolaire";

export const dynamic = "force-dynamic";

// Liste des factures de l'enseignant connecté, avec les classes concernées.
export async function GET(request) {
  const auth = await requireEnseignant(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("teacher_invoices")
    .select(
      "id, quote_id, label, supplier_name, description, amount_cents, school_year, status, admin_note, rib_id, rib_file_path, created_at, reimbursed_at"
    )
    .eq("teacher_id", auth.teacher.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (data || []).map((f) => f.id);
  const { data: liens } = ids.length
    ? await auth.admin
        .from("teacher_invoice_classes")
        .select("invoice_id, class_label")
        .in("invoice_id", ids)
    : { data: [] };

  const classesParFacture = {};
  for (const l of liens || []) {
    (classesParFacture[l.invoice_id] ||= []).push(l.class_label);
  }

  const factures = (data || []).map((f) => ({
    ...f,
    classes: classesParFacture[f.id] || [],
    a_rib: Boolean(f.rib_id || f.rib_file_path),
  }));
  return NextResponse.json({ ok: true, factures });
}

// Dépôt d'une facture de prestataire pour remboursement. AUCUN devis
// préalable requis : `quoteId` est facultatif. OBLIGATOIRE : le fichier de la
// facture ET au moins une classe concernée. Le RIB est joint soit en fichier
// (`ribFileDataUrl`), soit en réutilisant un RIB déjà déposé (`ribId`).
export async function POST(request) {
  const auth = await requireEnseignant(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const label = body?.label?.trim();
  const supplierName = body?.supplierName?.trim() || null;
  const description = body?.description?.trim() || null;
  const amount = Number(body?.amount);
  const quoteId = body?.quoteId || null;
  const ribId = body?.ribId || null;
  const classes = Array.isArray(body?.classes)
    ? [...new Set(body.classes.map((c) => String(c).trim()).filter(Boolean))]
    : [];

  if (!label) {
    return NextResponse.json({ error: "Donnez un intitulé à la facture." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Le montant doit être supérieur à 0." }, { status: 400 });
  }
  if (classes.length === 0) {
    return NextResponse.json(
      { error: "Sélectionnez au moins une classe concernée." },
      { status: 400 }
    );
  }

  // Rattachement facultatif à un devis : on vérifie qu'il appartient bien à
  // cet enseignant pour éviter qu'un identifiant arbitraire soit accepté.
  if (quoteId) {
    const { data: devis } = await auth.admin
      .from("teacher_quotes")
      .select("id")
      .eq("id", quoteId)
      .eq("teacher_id", auth.teacher.id)
      .maybeSingle();
    if (!devis) {
      return NextResponse.json({ error: "Devis rattaché introuvable." }, { status: 400 });
    }
  }

  // Idem pour un RIB réutilisé.
  if (ribId) {
    const { data: rib } = await auth.admin
      .from("teacher_ribs")
      .select("id")
      .eq("id", ribId)
      .eq("teacher_id", auth.teacher.id)
      .maybeSingle();
    if (!rib) {
      return NextResponse.json({ error: "RIB sélectionné introuvable." }, { status: 400 });
    }
  }

  const { path: invoicePath, error: uploadError } = await televerserFichier(auth.admin, {
    teacherId: auth.teacher.id,
    kind: "facture",
    dataUrl: body?.invoiceFileDataUrl,
  });
  if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });

  let ribFilePath = null;
  if (!ribId && body?.ribFileDataUrl) {
    const { path, error } = await televerserFichier(auth.admin, {
      teacherId: auth.teacher.id,
      kind: "rib",
      dataUrl: body.ribFileDataUrl,
    });
    if (error) return NextResponse.json({ error }, { status: 400 });
    ribFilePath = path;
  }

  const { data: facture, error: insertError } = await auth.admin
    .from("teacher_invoices")
    .insert({
      teacher_id: auth.teacher.id,
      quote_id: quoteId,
      label,
      supplier_name: supplierName,
      description,
      amount_cents: Math.round(amount * 100),
      school_year: currentSchoolYear(),
      invoice_file_path: invoicePath,
      rib_id: ribId,
      rib_file_path: ribFilePath,
    })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { error: classesError } = await auth.admin
    .from("teacher_invoice_classes")
    .insert(classes.map((class_label) => ({ invoice_id: facture.id, class_label })));

  if (classesError) return NextResponse.json({ error: classesError.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: facture.id });
}
