import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import { CONTACT_EMAIL, isMailConfigured, sendMail } from "../../../lib/mail";
import { currentSchoolYear, isMembershipValid } from "../../../lib/anneeScolaire";

const MATERNELLE = ["PS", "MS", "GS", "TPS"];
const ELEMENTAIRE = ["CP", "CE1", "CE2", "CM1", "CM2"];

function tokensDeClasse(classLevel) {
  return (classLevel || "").split(/[-\/]/).map((t) => t.trim()).filter(Boolean);
}

// Calcule la liste des familles correspondant au segment demandé, à partir
// des tables families/parents/children/memberships (mêmes données que
// /api/admin/familles).
function famillesCorrespondantes(familles, segment) {
  const annee = currentSchoolYear();
  const { scope, classes = [], niveaux = [], adherents = "tous" } = segment || {};

  return familles.filter((f) => {
    if (f.parents.length === 0) return false;

    if (adherents !== "tous") {
      const adhesion = f.memberships.find((m) => m.school_year === annee);
      const aJour = isMembershipValid(adhesion);
      if (adherents === "adherents" && !aJour) return false;
      if (adherents === "non_adherents" && aJour) return false;
    }

    if (scope === "toute") return true;

    const classesEnfants = f.children.map((c) => c.class_level || "");
    if (classes.length > 0) {
      const ok = classesEnfants.some((cl) => classes.includes(cl));
      if (ok) return true;
    }
    if (niveaux.length > 0) {
      const ok = classesEnfants.some((cl) => {
        const tokens = tokensDeClasse(cl);
        if (niveaux.includes("maternelle") && tokens.some((t) => MATERNELLE.includes(t))) return true;
        if (niveaux.includes("elementaire") && tokens.some((t) => ELEMENTAIRE.includes(t))) return true;
        return false;
      });
      if (ok) return true;
    }
    // Aucun filtre classe/niveau coché : ne restreint pas sur ce critère.
    if (classes.length === 0 && niveaux.length === 0) return true;
    return false;
  });
}

function resumeSegment(segment) {
  const { scope, classes = [], niveaux = [], adherents = "tous" } = segment || {};
  const parts = [];
  parts.push(scope === "toute" ? "Toute l'école" : "Sélection personnalisée");
  if (scope !== "toute") {
    if (classes.length) parts.push(`Classes : ${classes.join(", ")}`);
    if (niveaux.length) {
      const labels = { maternelle: "Maternelle", elementaire: "Élémentaire" };
      parts.push(`Niveaux : ${niveaux.map((n) => labels[n] || n).join(", ")}`);
    }
  }
  if (adherents === "adherents") parts.push("Adhérents à jour uniquement");
  if (adherents === "non_adherents") parts.push("Non-adhérents uniquement");
  return parts.join(" — ");
}

async function chargerFamilles(admin) {
  const [familiesRes, parentsRes, childrenRes, membershipsRes] = await Promise.all([
    admin.from("families").select("*"),
    admin.from("parents").select("*"),
    admin.from("children").select("*"),
    admin.from("memberships").select("*"),
  ]);
  const familles = (familiesRes.data || []).map((f) => ({
    ...f,
    parents: (parentsRes.data || []).filter((p) => p.family_id === f.id),
    children: (childrenRes.data || []).filter((c) => c.family_id === f.id),
    memberships: (membershipsRes.data || []).filter((m) => m.family_id === f.id),
  }));
  return familles;
}

function destinatairesDe(familles) {
  const vus = new Set();
  const destinataires = [];
  for (const f of familles) {
    for (const p of f.parents) {
      if (!p.email || vus.has(p.email.toLowerCase())) continue;
      vus.add(p.email.toLowerCase());
      destinataires.push({
        email: p.email,
        firstName: p.first_name,
        lastName: p.last_name,
      });
    }
  }
  return destinataires;
}

// Historique des campagnes envoyées.
export async function GET(request) {
  const auth = await requirePermission(request, "emails");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.admin
    .from("email_campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Récupère la liste des classes réellement utilisées, pour le formulaire.
  const { data: enfants } = await auth.admin.from("children").select("class_level");
  const classes = Array.from(
    new Set((enfants || []).map((c) => c.class_level).filter(Boolean))
  ).sort();

  return NextResponse.json({ campagnes: data || [], classes });
}

// Calcule un aperçu des destinataires (dryRun) ou envoie réellement le
// message à toutes les familles du segment.
export async function POST(request) {
  const auth = await requirePermission(request, "emails");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { segment, subject, message, dryRun } = await request.json();

  const familles = await chargerFamilles(auth.admin);
  const correspondantes = famillesCorrespondantes(familles, segment);
  const destinataires = destinatairesDe(correspondantes);

  if (dryRun) {
    return NextResponse.json({
      destinataires,
      count: destinataires.length,
      mailConfigured: isMailConfigured(),
    });
  }

  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json(
      { error: "Sujet et message obligatoires." },
      { status: 400 }
    );
  }

  const mailConfigured = isMailConfigured();
  let sentCount = 0;

  if (mailConfigured) {
    for (const dest of destinataires) {
      const res = await sendMail({
        to: dest.email,
        subject,
        text: message,
        replyTo: CONTACT_EMAIL,
      });
      if (res.sent) sentCount += 1;
    }
  }

  await auth.admin.from("email_campaigns").insert({
    subject,
    message,
    segment: segment || {},
    segment_summary: resumeSegment(segment),
    recipients_count: destinataires.length,
    sent_count: sentCount,
    mail_configured: mailConfigured,
    created_by: auth.parent.id,
  });

  return NextResponse.json({
    ok: true,
    recipientsCount: destinataires.length,
    sentCount,
    mailConfigured,
    destinataires: mailConfigured ? undefined : destinataires,
  });
}
