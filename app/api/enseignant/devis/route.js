import { NextResponse } from "next/server";
import { requireEnseignant } from "../../../lib/enseignantAuth";
import { televerserFichier } from "../../../lib/enseignantFichiers";
import { currentSchoolYear } from "../../../lib/anneeScolaire";

export const dynamic = "force-dynamic";

// Liste des devis de l'enseignant connecté, le plus récent d'abord, avec les
// classes concernées.
export async function GET(request) {
  const auth = await requireEnseignant(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("teacher_quotes")
    .select("id, title, description, amount_cents, school_year, status, admin_note, created_at, decided_at")
    .eq("teacher_id", auth.teacher.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (data || []).map((d) => d.id);
  const { data: liens } = ids.length
    ? await auth.admin.from("teacher_quote_classes").select("quote_id, class_label").in("quote_id", ids)
    : { data: [] };

  const classesParDevis = {};
  for (const l of liens || []) {
    (classesParDevis[l.quote_id] ||= []).push(l.class_label);
  }

  const devis = (data || []).map((d) => ({ ...d, classes: classesParDevis[d.id] || [] }));
  return NextResponse.json({ ok: true, devis });
}

// Dépôt d'un devis à faire valider par le bureau. OBLIGATOIRE : un fichier
// (PDF ou photo) ET au moins une classe concernée.
export async function POST(request) {
  const auth = await requireEnseignant(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const title = body?.title?.trim();
  const description = body?.description?.trim() || null;
  const amount = Number(body?.amount);
  const classes = Array.isArray(body?.classes)
    ? [...new Set(body.classes.map((c) => String(c).trim()).filter(Boolean))]
    : [];

  if (!title) {
    return NextResponse.json({ error: "Donnez un intitulé au devis." }, { status: 400 });
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

  const { path, error: uploadError } = await televerserFichier(auth.admin, {
    teacherId: auth.teacher.id,
    kind: "devis",
    dataUrl: body?.quoteFileDataUrl,
  });
  if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });

  const { data: devis, error: insertError } = await auth.admin
    .from("teacher_quotes")
    .insert({
      teacher_id: auth.teacher.id,
      title,
      description,
      amount_cents: Math.round(amount * 100),
      school_year: currentSchoolYear(),
      quote_file_path: path,
    })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { error: classesError } = await auth.admin
    .from("teacher_quote_classes")
    .insert(classes.map((class_label) => ({ quote_id: devis.id, class_label })));

  if (classesError) return NextResponse.json({ error: classesError.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: devis.id });
}
