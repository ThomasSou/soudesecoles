import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import { CONTACT_EMAIL, sendMail } from "../../../lib/mail";
import { envoyerInvitation } from "../../../lib/invitations";

const SCHOOL_YEAR = process.env.NEXT_PUBLIC_SCHOOL_YEAR || "2025-2026";

export async function GET(request) {
  const auth = await requirePermission(request, "demandes");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.admin
    .from("registration_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ demandes: data || [] });
}

// Valide ou refuse une demande.
// Valider = créer la famille + le parent + les enfants, puis inviter le parent
// par e-mail (même mécanisme que l'import de début d'année).
export async function POST(request) {
  const auth = await requirePermission(request, "demandes");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = auth.admin;

  const { id, action } = await request.json();
  if (!id || !["valider", "refuser"].includes(action)) {
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  }

  const { data: demande, error: readError } = await admin
    .from("registration_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (readError || !demande) {
    return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
  }
  if (demande.status !== "pending") {
    return NextResponse.json(
      { error: "Cette demande a déjà été traitée." },
      { status: 409 }
    );
  }

  if (action === "refuser") {
    await admin
      .from("registration_requests")
      .update({ status: "refused" })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "refused" });
  }

  // --- Validation ---
  const { data: family, error: familyError } = await admin
    .from("families")
    .insert({
      city: "Montmerle-sur-Saône",
      postal_code: "01090",
      status_current_year: "non_adherent",
    })
    .select()
    .single();

  if (familyError) {
    return NextResponse.json({ error: familyError.message }, { status: 500 });
  }

  const { data: nouveauParent, error: parentError } = await admin
    .from("parents")
    .insert({
      family_id: family.id,
      first_name: demande.first_name,
      last_name: demande.last_name,
      email: demande.email,
      phone: demande.phone,
      role: "parent",
    })
    .select()
    .single();

  if (parentError) {
    await admin.from("families").delete().eq("id", family.id);
    return NextResponse.json({ error: parentError.message }, { status: 500 });
  }

  const { error: inviteError } = await envoyerInvitation(admin, {
    email: demande.email,
    firstName: demande.first_name,
    lastName: demande.last_name,
    parentId: nouveauParent.id,
  });

  if (inviteError) {
    // On annule la fiche et la famille créées pour ne pas laisser de ligne
    // orpheline (family_id passe à null sur suppression de famille, la
    // fiche parent doit donc être supprimée explicitement en premier).
    await admin.from("parents").delete().eq("id", nouveauParent.id);
    await admin.from("families").delete().eq("id", family.id);
    return NextResponse.json(
      { error: `Invitation impossible : ${inviteError.message}` },
      { status: 500 }
    );
  }

  const childRows = (demande.children || [])
    .filter((c) => c.firstName && c.lastName)
    .map((c) => ({
      family_id: family.id,
      first_name: c.firstName,
      last_name: c.lastName,
      class_level: c.classLevel || null,
      school_year: SCHOOL_YEAR,
    }));

  if (childRows.length > 0) {
    await admin.from("children").insert(childRows);
  }

  await admin
    .from("registration_requests")
    .update({ status: "approved" })
    .eq("id", id);

  await sendMail({
    to: CONTACT_EMAIL,
    subject: "[Site] Demande d'inscription validée",
    text: `La demande de ${demande.first_name} ${demande.last_name} (${demande.email}) a été validée par ${auth.parent.first_name} ${auth.parent.last_name}. L'invitation a été envoyée.`,
  });

  return NextResponse.json({ ok: true, status: "approved", familyId: family.id });
}
