import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import { isMailConfigured } from "../../../lib/mail";
import { currentSchoolYear, isMembershipValid } from "../../../lib/anneeScolaire";
import { renderBlocksToHtml, renderBlocksToText } from "../../../lib/emailBlocks";

export const dynamic = "force-dynamic";

// Canal d'envoi réellement actif en production, pour l'afficher dans le
// back-office (savoir en un coup d'œil si une campagne partira par Sender,
// taillé pour l'envoi en masse, ou par le SMTP classique en repli).
function canalEnvoi() {
  if (process.env.SENDER_API_KEY && process.env.SENDER_FROM_EMAIL) return "sender";
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    return "smtp";
  }
  return "aucun";
}

const MATERNELLE = ["PS", "MS", "GS", "TPS"];
const ELEMENTAIRE = ["CP", "CE1", "CE2", "CM1", "CM2"];

function tokensDeClasse(classLevel) {
  return (classLevel || "").split(/[-\/]/).map((t) => t.trim()).filter(Boolean);
}

// Calcule la liste des familles correspondant au segment demandé, à partir
// des tables families/parents/children/memberships (mêmes données que
// /api/admin/familles). Ajoute le statut d'adhésion (aJour) sur chaque
// famille, réutilisé ensuite pour personnaliser chaque e-mail.
function famillesCorrespondantes(familles, segment) {
  const annee = currentSchoolYear();
  const { scope, classes = [], niveaux = [], adherents = "tous" } = segment || {};

  return familles
    .map((f) => {
      const adhesion = f.memberships.find((m) => m.school_year === annee);
      return { ...f, aJour: isMembershipValid(adhesion) };
    })
    .filter((f) => {
      if (f.parents.length === 0) return false;

      if (adherents !== "tous") {
        if (adherents === "adherents" && !f.aJour) return false;
        if (adherents === "non_adherents" && f.aJour) return false;
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

// Un destinataire par parent (pas par famille) : le prénom qui apparaît
// dans "Bonjour {{prenom}}" doit être celui de la personne qui reçoit
// l'e-mail, pas celui de son conjoint.
function destinatairesDe(familles) {
  const vus = new Set();
  const destinataires = [];
  for (const f of familles) {
    for (const p of f.parents) {
      if (!p.email || vus.has(p.email.toLowerCase())) continue;
      if (p.email_opt_out) continue; // désinscrit des e-mails
      vus.add(p.email.toLowerCase());
      destinataires.push({
        parentId: p.id,
        email: p.email,
        firstName: p.first_name,
        lastName: p.last_name,
        adherent: f.aJour,
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

  // Événements bénévoles actifs : proposés pour insérer leur planning de
  // créneaux dans une campagne.
  const { data: evenementsBenevoles } = await auth.admin
    .from("benevolat_evenements")
    .select("id, nom")
    .eq("actif", true)
    .order("nom");

  return NextResponse.json({
    campagnes: data || [],
    classes,
    benevolesEvenements: evenementsBenevoles || [],
  });
}

// Calcule un aperçu des destinataires (dryRun) ou envoie réellement le
// message à toutes les familles du segment. Le contenu (contentBlocks) est
// rendu séparément pour chaque destinataire : champs de fusion (prénom,
// nom) et bandeau d'adhésion personnalisés, logo et logos partenaires
// ajoutés automatiquement (cf. app/lib/emailBlocks.js).
export async function POST(request) {
  const auth = await requirePermission(request, "emails");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { segment, subject, contentBlocks, dryRun, benevolesEvenementId } =
    await request.json();

  const familles = await chargerFamilles(auth.admin);
  const correspondantes = famillesCorrespondantes(familles, segment);
  const destinataires = destinatairesDe(correspondantes);

  if (dryRun) {
    return NextResponse.json({
      destinataires,
      count: destinataires.length,
      mailConfigured: isMailConfigured(),
      canal: canalEnvoi(),
      segmentSummary: resumeSegment(segment),
    });
  }

  const blocks = contentBlocks || [];
  if (!subject?.trim() || blocks.length === 0) {
    return NextResponse.json(
      { error: "Sujet et contenu obligatoires." },
      { status: 400 }
    );
  }

  const mailConfigured = isMailConfigured();
  const aEnvoyer = mailConfigured && destinataires.length > 0;

  // Création de la campagne. Elle porte la liste figée des destinataires et
  // un curseur (next_index). L'envoi lui-même ne se fait PAS ici : cette
  // requête reste légère (calcul du segment + insertion). Le front enchaîne
  // ensuite les vagues via /api/admin/emails/continuer, avec reprise
  // possible si l'onglet est fermé (cf. app/lib/emailCampagne.js).
  const { data: campagne, error: insertError } = await auth.admin
    .from("email_campaigns")
    .insert({
      subject,
      message: renderBlocksToText(blocks),
      html: renderBlocksToHtml(blocks, { subject }),
      content_blocks: blocks,
      segment: segment || {},
      segment_summary: resumeSegment(segment),
      recipients_count: destinataires.length,
      sent_count: 0,
      mail_configured: mailConfigured,
      created_by: auth.parent.id,
      status: aEnvoyer ? "en_cours" : "termine",
      next_index: 0,
      recipients: aEnvoyer ? destinataires : [],
      benevoles_evenement_id: benevolesEvenementId || null,
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    campaignId: campagne.id,
    recipientsCount: destinataires.length,
    sentCount: 0,
    done: !aEnvoyer,
    mailConfigured,
    canal: canalEnvoi(),
    // Adresses renvoyées seulement si rien ne partira automatiquement, pour
    // un envoi manuel en attendant.
    destinataires: mailConfigured ? undefined : destinataires,
  });
}
