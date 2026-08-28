import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import { CONTACT_EMAIL, sendMail } from "../../../lib/mail";
import { envoyerInvitation } from "../../../lib/invitations";

export const dynamic = "force-dynamic";

const SCHOOL_YEAR = process.env.NEXT_PUBLIC_SCHOOL_YEAR || "2025-2026";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sou-montmerle.fr";

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

// Gabarit HTML des e-mails de décision, dans le même esprit visuel que
// l'invitation (cf. app/lib/invitations.js).
function gabaritDecision({ firstName, acceptee, motif }) {
  const salutation = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  const titre = acceptee
    ? "Votre demande d'inscription a été acceptée"
    : "Votre demande d'inscription n'a pas été retenue";
  const corps = acceptee
    ? `<p>Le bureau du Sou des Écoles a validé votre demande. Vous allez recevoir un second e-mail pour activer votre espace famille (adhésion en ligne, carte d'adhérent, historique).</p>
       <p style="font-size: 13px; color: #64748b;">S'il n'arrive pas d'ici quelques minutes, pensez à vérifier vos courriers indésirables, ou rendez-vous sur <a href="${SITE_URL}/mot-de-passe-oublie" style="color: #1F3864;">${SITE_URL.replace(/^https?:\/\//, "")}/mot-de-passe-oublie</a>.</p>`
    : `<p>Après examen, le bureau du Sou des Écoles n'a pas donné suite à votre demande d'inscription.</p>
       <p style="font-size: 13px; color: #64748b;">Si vous pensez qu'il s'agit d'une erreur, répondez simplement à cet e-mail.</p>`;
  const blocMotif = motif
    ? `<p style="background: #f1f5f9; border-radius: 8px; padding: 12px 16px; white-space: pre-wrap;">${escapeHtml(
        motif
      )}</p>`
    : "";
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
      <p style="font-size: 18px; font-weight: bold; color: #1F3864;">Sou des Écoles Montmerle-Lurcy</p>
      <p>${salutation}</p>
      <p style="font-weight: bold;">${titre}</p>
      ${corps}
      ${blocMotif}
    </div>
  `;
}

function gabaritDecisionTexte({ firstName, acceptee, motif }) {
  const salutation = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  const corps = acceptee
    ? "Le bureau du Sou des Écoles a validé votre demande d'inscription. Vous allez recevoir un second e-mail pour activer votre espace famille."
    : "Après examen, le bureau du Sou des Écoles n'a pas donné suite à votre demande d'inscription. Si vous pensez qu'il s'agit d'une erreur, répondez simplement à cet e-mail.";
  return [
    salutation,
    "",
    corps,
    motif ? "" : null,
    motif ? `Message du bureau :\n${motif}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Valide ou refuse une demande.
// Valider = créer la famille + le parent + les enfants, puis inviter le parent
// par e-mail (même mécanisme que l'import de début d'année).
// Dans les deux cas, la personne reçoit un e-mail lui confirmant la décision,
// avec le motif éventuellement saisi par le bureau.
export async function POST(request) {
  const auth = await requirePermission(request, "demandes");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = auth.admin;

  const body = await request.json();
  const { id, action } = body;
  const motif = typeof body.message === "string" ? body.message.trim() : "";
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

  const decisionCommune = {
    decision_message: motif || null,
    decided_at: new Date().toISOString(),
    decided_by: auth.parent.id,
  };

  if (action === "refuser") {
    await admin
      .from("registration_requests")
      .update({ status: "refused", ...decisionCommune })
      .eq("id", id);

    const mail = await sendMail({
      to: demande.email,
      subject: "Votre demande d'inscription — Sou des Écoles Montmerle-Lurcy",
      html: gabaritDecision({
        firstName: demande.first_name,
        acceptee: false,
        motif,
      }),
      text: gabaritDecisionTexte({
        firstName: demande.first_name,
        acceptee: false,
        motif,
      }),
    });

    return NextResponse.json({
      ok: true,
      status: "refused",
      mailSent: Boolean(mail.sent),
    });
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
    .update({ status: "approved", ...decisionCommune })
    .eq("id", id);

  // Notification interne au bureau.
  await sendMail({
    to: CONTACT_EMAIL,
    subject: "[Site] Demande d'inscription validée",
    text: `La demande de ${demande.first_name} ${demande.last_name} (${demande.email}) a été validée par ${auth.parent.first_name} ${auth.parent.last_name}. L'invitation a été envoyée.`,
  });

  // Confirmation à la personne. L'invitation part en parallèle (sujet
  // « Activez votre espace famille ») ; cet e-mail-ci confirme explicitement
  // la décision et prévient qu'un second message suit, ce qui aide si
  // l'invitation atterrit dans les indésirables.
  const mail = await sendMail({
    to: demande.email,
    subject: "Votre demande d'inscription — Sou des Écoles Montmerle-Lurcy",
    html: gabaritDecision({
      firstName: demande.first_name,
      acceptee: true,
      motif,
    }),
    text: gabaritDecisionTexte({
      firstName: demande.first_name,
      acceptee: true,
      motif,
    }),
  });

  return NextResponse.json({
    ok: true,
    status: "approved",
    familyId: family.id,
    mailSent: Boolean(mail.sent),
  });
}
