import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import { isMailConfigured } from "../../../lib/mail";
import { currentSchoolYear, isMembershipValid } from "../../../lib/anneeScolaire";
import { renderBlocksToHtml, renderBlocksToText } from "../../../lib/emailBlocks";

export const dynamic = "force-dynamic";

// Canal d'envoi réellement actif en production, pour l'afficher dans le
// back-office. Depuis le correctif « SMTP en primaire » (cf. emailCampagne.js,
// `viaSmtpDabord: true`), une campagne part d'abord par le SMTP Infomaniak,
// Sender ne servant plus que de secours. On affiche donc "smtp" dès que le
// SMTP est configuré, et "sender" seulement s'il n'y a que Sender.
function canalEnvoi() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    return "smtp";
  }
  if (process.env.SENDER_API_KEY && process.env.SENDER_FROM_EMAIL) return "sender";
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

// Découpe une saisie libre d'adresses (une par ligne, ou séparées par des
// espaces / virgules / points-virgules) en liste d'e-mails dédupliquée.
function normaliserAdresses(adresses) {
  const brut = Array.isArray(adresses) ? adresses.join("\n") : String(adresses || "");
  const vus = new Set();
  const out = [];
  for (const morceau of brut.split(/[\s,;]+/)) {
    const e = morceau.trim();
    if (!e || !e.includes("@")) continue;
    const cle = e.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push(e);
  }
  return out;
}

function resumeSegment(segment) {
  const horsServis = segment?.exclureDejaServis ? " — hors déjà destinataires" : "";

  if (segment?.scope === "liste") {
    const n = normaliserAdresses(segment.adresses).length;
    return `Liste d'adresses (${n})${horsServis}`;
  }

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
  if (inclutContacts(segment)) parts.push("+ contacts hors familles");
  if (segment?.exclureDejaServis) parts.push("hors déjà destinataires");
  return parts.join(" — ");
}

// Faut-il joindre les contacts légers (email_contacts) à cet envoi ? Jamais
// avec « Adhérents à jour uniquement » : par définition ces contacts n'ont
// pas d'adhésion, les inclure serait un contresens.
function inclutContacts(segment) {
  return Boolean(segment?.inclureContacts) && segment?.adherents !== "adherents";
}

// Adresses (en minuscules) ayant déjà reçu un e-mail d'une campagne
// précédente — pour l'option « ne pas renvoyer aux personnes déjà servies »,
// utile quand on envoie une même communication en plusieurs vagues sur
// plusieurs jours. On ne compte que les envois réussis (statut 'envoye') :
// un échec précédent doit pouvoir être retenté.
async function adressesDejaServies(admin) {
  const { data, error } = await admin
    .from("email_campaign_recipients")
    .select("email")
    .eq("statut", "envoye")
    .limit(50000);
  if (error) return new Set(); // table absente : on n'exclut personne
  return new Set((data || []).map((r) => (r.email || "").toLowerCase()).filter(Boolean));
}

// Destinataires issus de la table email_contacts (personnes sans fiche
// famille). On saute tout e-mail déjà pris par un parent OU par un autre
// contact : jamais deux envois à la même adresse, et un parent l'emporte
// toujours sur un contact homonyme (les e-mails parents sont ajoutés à
// `dejaPris` avant l'appel).
function contactsDestinataires(contacts, dejaPris) {
  const vus = new Set(dejaPris);
  const out = [];
  for (const c of contacts || []) {
    if (!c.email || c.email_opt_out) continue;
    const cle = c.email.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push({
      contactId: c.id,
      email: c.email,
      firstName: c.first_name,
      lastName: c.last_name,
      adherent: false,
    });
  }
  return out;
}

// Destinataires d'un envoi ciblé « liste d'adresses » : on prend exactement
// les adresses saisies. Chacune est enrichie si elle correspond à un parent
// (prénom, statut d'adhésion, lien de désinscription propre) ou à un contact
// léger ; sinon elle part telle quelle. Les adresses désinscrites (parent ou
// contact) sont exclues.
async function destinatairesDeListe(admin, adresses) {
  const emails = normaliserAdresses(adresses);
  if (emails.length === 0) return [];

  const [parentsRes, contactsRes, membershipsRes] = await Promise.all([
    admin.from("parents").select("id, first_name, last_name, email, family_id, email_opt_out"),
    admin.from("email_contacts").select("id, first_name, last_name, email, email_opt_out"),
    admin.from("memberships").select("family_id, school_year, paid_at"),
  ]);

  const annee = currentSchoolYear();
  const adhesionParFamille = new Map();
  for (const m of membershipsRes.data || []) {
    if (m.school_year === annee) adhesionParFamille.set(m.family_id, m);
  }
  const parentParEmail = new Map();
  for (const p of parentsRes.data || []) {
    if (p.email) parentParEmail.set(p.email.toLowerCase(), p);
  }
  const contactParEmail = new Map();
  for (const c of contactsRes.data || []) {
    if (c.email) contactParEmail.set(c.email.toLowerCase(), c);
  }

  const out = [];
  for (const email of emails) {
    const cle = email.toLowerCase();
    const p = parentParEmail.get(cle);
    if (p) {
      if (p.email_opt_out) continue;
      out.push({
        parentId: p.id,
        email: p.email,
        // Toujours des chaînes : un undefined disparaîtrait à la
        // sérialisation JSON de `recipients` et le rendu retomberait sur le
        // destinataire par défaut (« Bonjour Camille »).
        firstName: p.first_name || "",
        lastName: p.last_name || "",
        adherent: isMembershipValid(adhesionParFamille.get(p.family_id)),
      });
      continue;
    }
    const c = contactParEmail.get(cle);
    if (c) {
      if (c.email_opt_out) continue;
      out.push({
        contactId: c.id,
        email: c.email,
        firstName: c.first_name || "",
        lastName: c.last_name || "",
        adherent: false,
      });
      continue;
    }
    out.push({ email, firstName: "", lastName: "", adherent: false });
  }
  return out;
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

  // Contacts légers (email_contacts) encore inscrits : proposés comme
  // destinataires supplémentaires d'une campagne.
  const { data: contactsActifs } = await auth.admin
    .from("email_contacts")
    .select("id")
    .eq("email_opt_out", false);

  return NextResponse.json({
    campagnes: data || [],
    classes,
    benevolesEvenements: evenementsBenevoles || [],
    contactsCount: (contactsActifs || []).length,
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

  const {
    segment,
    subject,
    contentBlocks,
    dryRun,
    benevolesEvenementId,
    brouillon,
    campaignId,
    brouillonId,
  } = await request.json();

  // Enregistrement d'un brouillon : on fige le contenu de l'éditeur sur une
  // ligne email_campaigns en statut 'brouillon', sans calculer de
  // destinataires ni rien envoyer. Modifie la ligne existante si campaignId
  // est fourni (on continue d'éditer le même brouillon), sinon en crée une.
  if (brouillon) {
    const blocs = contentBlocks || [];
    const champs = {
      subject: subject || "",
      message: renderBlocksToText(blocs),
      html: renderBlocksToHtml(blocs, { subject }),
      content_blocks: blocs,
      segment: segment || {},
      segment_summary: resumeSegment(segment),
      recipients_count: 0,
      sent_count: 0,
      mail_configured: isMailConfigured(),
      status: "brouillon",
      next_index: 0,
      recipients: [],
      benevoles_evenement_id: benevolesEvenementId || null,
      updated_at: new Date().toISOString(),
    };

    let ligne = null;
    if (campaignId) {
      const { data, error } = await auth.admin
        .from("email_campaigns")
        .update(champs)
        .eq("id", campaignId)
        .eq("status", "brouillon")
        .select("id")
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      ligne = data;
    }
    if (!ligne) {
      const { data, error } = await auth.admin
        .from("email_campaigns")
        .insert({ ...champs, created_by: auth.parent.id })
        .select("id")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      ligne = data;
    }
    return NextResponse.json({ ok: true, brouillon: true, campaignId: ligne.id });
  }

  let destinataires;
  if (segment?.scope === "liste") {
    destinataires = await destinatairesDeListe(auth.admin, segment.adresses);
  } else {
    const familles = await chargerFamilles(auth.admin);
    const correspondantes = famillesCorrespondantes(familles, segment);
    destinataires = destinatairesDe(correspondantes);

    if (inclutContacts(segment)) {
      const { data: contacts } = await auth.admin
        .from("email_contacts")
        .select("id, first_name, last_name, email, email_opt_out");
      const dejaPris = new Set(destinataires.map((d) => d.email.toLowerCase()));
      destinataires.push(...contactsDestinataires(contacts, dejaPris));
    }
  }

  let exclusDejaServis = 0;
  if (segment?.exclureDejaServis) {
    const servies = await adressesDejaServies(auth.admin);
    const avant = destinataires.length;
    destinataires = destinataires.filter((d) => !servies.has((d.email || "").toLowerCase()));
    exclusDejaServis = avant - destinataires.length;
  }

  if (dryRun) {
    return NextResponse.json({
      destinataires,
      count: destinataires.length,
      exclusDejaServis,
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
      // Ancien exprès : le verrou d'envoi (cf. /api/admin/emails/continuer)
      // teste `updated_at < maintenant - 30 s` ; une date lointaine garantit
      // que la toute première vague peut démarrer sans attendre.
      updated_at: new Date(0).toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // La campagne vient d'être créée pour de bon : si elle partait d'un
  // brouillon, on retire ce dernier pour ne pas encombrer l'historique.
  if (brouillonId) {
    await auth.admin
      .from("email_campaigns")
      .delete()
      .eq("id", brouillonId)
      .eq("status", "brouillon");
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

// Suppression d'un brouillon (jamais d'une campagne réellement envoyée : le
// filtre status='brouillon' l'empêche).
export async function DELETE(request) {
  const auth = await requirePermission(request, "emails");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  }

  const { error } = await auth.admin
    .from("email_campaigns")
    .delete()
    .eq("id", id)
    .eq("status", "brouillon");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
