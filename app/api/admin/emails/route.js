import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { isMailConfigured } from "../../../lib/mail";
import { currentSchoolYear, isMembershipValid } from "../../../lib/anneeScolaire";
import { renderBlocksToHtml, renderBlocksToText } from "../../../lib/emailBlocks";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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

// Une famille est "ancienne" quand plus aucun de ses enfants n'a l'année
// scolaire en cours : leur ligne `children` existe encore (on ne supprime
// jamais un enfant qui a quitté l'école), mais son `school_year` date d'un
// import précédent. Même détection que scripts/marquer-anciennes-familles.mjs
// (qui pose le statut `status_current_year = 'ancien_parent'', jamais
// automatique) — calculée ici à la volée pour rester juste sans dépendre de
// ce script manuel.
// Enfant en petite ou moyenne section : niveau individuel s'il est renseigné,
// sinon classe à un seul niveau (« PS », « MS »).
function enfantEstPsMs(c) {
  if (c.niveau) return ["PS", "MS"].includes(c.niveau);
  const tokens = tokensDeClasse(c.class_level);
  return tokens.length > 0 && tokens.every((t) => ["PS", "MS"].includes(t));
}

// Famille dont tous les enfants de l'année sont en PS ou MS : c'est elle que
// l'option « hors familles PS/MS » écarte (une fratrie avec un plus grand
// reste, elle, destinataire).
function familleToutePsMs(f, annee) {
  const enfants = (f.children || []).filter((c) => c.school_year === annee);
  return enfants.length > 0 && enfants.every(enfantEstPsMs);
}

function familleEstAncienne(f, annee) {
  return !(f.children || []).some((c) => c.school_year === annee);
}

// Calcule la liste des familles correspondant au segment demandé, à partir
// des tables families/parents/children/memberships (mêmes données que
// /api/admin/familles). Ajoute le statut d'adhésion (aJour) sur chaque
// famille, réutilisé ensuite pour personnaliser chaque e-mail.
function famillesCorrespondantes(familles, segment) {
  const annee = currentSchoolYear();
  const { scope, classes = [], niveaux = [], niveauEnfant = [], adherents = "tous" } = segment || {};

  return familles
    .map((f) => {
      const adhesion = f.memberships.find((m) => m.school_year === annee);
      return { ...f, aJour: isMembershipValid(adhesion) };
    })
    .filter((f) => {
      if (f.parents.length === 0) return false;
      if (segment?.exclureToutPsMs && familleToutePsMs(f, annee)) return false;

      if (adherents !== "tous") {
        if (adherents === "adherents" && !f.aJour) return false;
        if (adherents === "non_adherents" && f.aJour) return false;
      }

      // "Toute l'école" = les familles ayant réellement un enfant scolarisé
      // cette année. Les anciens parents ne doivent jamais s'y retrouver
      // mélangés : ils ne sont joignables que via la case dédiée ci-dessous.
      if (scope === "toute") return !familleEstAncienne(f, annee);

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
        if (niveaux.includes("anciens") && familleEstAncienne(f, annee)) return true;
      }
      // Niveau individuel de l'enfant (PS/MS/GS), indépendant de sa classe :
      // dans une classe à double niveau (ex. "Moyens-Grands"), seuls les
      // enfants du niveau coché reçoivent l'e-mail, pas toute la classe.
      if (niveauEnfant.length > 0) {
        const ok = f.children.some((c) => c.niveau && niveauEnfant.includes(c.niveau));
        if (ok) return true;
      }
      // Aucun filtre classe/niveau coché : ne restreint pas sur ce critère.
      if (classes.length === 0 && niveaux.length === 0 && niveauEnfant.length === 0) return true;
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

  const { scope, classes = [], niveaux = [], niveauEnfant = [], adherents = "tous" } = segment || {};
  const parts = [];
  parts.push(scope === "toute" ? "Toute l'école (hors anciens parents)" : "Sélection personnalisée");
  if (scope !== "toute") {
    if (classes.length) parts.push(`Classes : ${classes.join(", ")}`);
    if (niveaux.length) {
      const labels = { maternelle: "Maternelle", elementaire: "Élémentaire", anciens: "Anciens parents" };
      parts.push(`Niveaux : ${niveaux.map((n) => labels[n] || n).join(", ")}`);
    }
    if (niveauEnfant.length) parts.push(`Niveau exact : ${niveauEnfant.join(", ")}`);
  }
  if (adherents === "adherents") parts.push("Adhérents à jour uniquement");
  if (adherents === "non_adherents") parts.push("Non-adhérents uniquement");
  if (segment?.sansCompte) parts.push("compte non activé uniquement");
  if (inclutContacts(segment)) parts.push("+ contacts hors familles");
  if (segment?.exclureToutPsMs) parts.push("hors familles dont tous les enfants sont en PS/MS");
  if (segment?.sansCommandeBoutiqueId) parts.push("n'ayant pas encore commandé dans la boutique choisie");
  if (segment?.sansBenevolatEvenementId) parts.push("pas encore inscrits comme bénévoles");
  if (segment?.exclureDejaServis) parts.push("hors déjà destinataires");
  return parts.join(" — ");
}

// Faut-il joindre les contacts légers (email_contacts) à cet envoi ? Jamais
// avec « Adhérents à jour uniquement » : par définition ces contacts n'ont
// pas d'adhésion, les inclure serait un contresens.
function inclutContacts(segment) {
  return Boolean(segment?.inclureContacts) && segment?.adherents !== "adherents" && !segment?.sansCompte;
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

// Adresses dont le compte est VRAIMENT activé : seule une connexion effective
// (`last_sign_in_at`) le prouve. L'invitation crée le compte Auth dès l'envoi
// (`confirmed_at` est alors déjà rempli), elle ne dit donc rien (même règle
// que l'écran Familles, cf. /api/admin/familles).
async function emailsAvecCompteActive(admin) {
  const actives = new Set();
  const parPage = 1000;
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: parPage });
    const users = data?.users || [];
    for (const u of users) {
      if (u.email && u.last_sign_in_at) actives.add(u.email.toLowerCase());
    }
    if (users.length < parPage) break;
  }
  return actives;
}

// Un destinataire par parent (pas par famille) : le prénom qui apparaît
// dans "Bonjour {{prenom}}" doit être celui de la personne qui reçoit
// l'e-mail, pas celui de son conjoint.
function destinatairesDe(familles, comptesActives = null) {
  const vus = new Set();
  const destinataires = [];
  for (const f of familles) {
    for (const p of f.parents) {
      if (!p.email || vus.has(p.email.toLowerCase())) continue;
      // Relance « sans compte » : on écarte les personnes qui se sont déjà
      // connectées au moins une fois (cf. emailsAvecCompteActive).
      if (comptesActives && comptesActives.has(p.email.toLowerCase())) continue;
      if (p.email_opt_out) continue; // désinscrit des e-mails
      if (p.email_invalide_le) continue; // adresse signalée invalide (rebond)
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

// Adresses des personnes ayant une commande PAYÉE dans cette boutique. On
// retient aussi les autres parents de la même famille : si l'un a commandé,
// l'autre n'a pas à être relancé. La boutique d'une commande se déduit de ses
// produits (même règle que l'écran Commandes, pas de colonne dédiée).
async function emailsAyantCommande(admin, boutiqueId) {
  const { data: produits } = await admin.from("shop_products").select("id").eq("boutique_id", boutiqueId);
  const ids = new Set((produits || []).map((p) => p.id));
  const emails = new Set();
  const familles = new Set();
  const { data: commandes } = await admin
    .from("shop_orders")
    .select("buyer_email, family_id, parent_id, items")
    .eq("status", "paid")
    .limit(5000);
  const parentsDirects = new Set();
  for (const o of commandes || []) {
    if (!(o.items || []).some((it) => ids.has(it.productId))) continue;
    if (o.buyer_email) emails.add(o.buyer_email.toLowerCase());
    if (o.family_id) familles.add(o.family_id);
    if (o.parent_id) parentsDirects.add(o.parent_id);
  }
  if (familles.size || parentsDirects.size) {
    const { data: parents } = await admin.from("parents").select("id, email, family_id");
    for (const p of parents || []) {
      if (p.email && (familles.has(p.family_id) || parentsDirects.has(p.id))) emails.add(p.email.toLowerCase());
    }
  }
  return emails;
}

// Adresses de ceux qui ont au moins un créneau bénévole sur cet événement.
async function emailsInscritsBenevoles(admin, evenementId) {
  const { data: ateliers } = await admin.from("benevolat_ateliers").select("id").eq("evenement_id", evenementId);
  const atelierIds = (ateliers || []).map((a) => a.id);
  if (!atelierIds.length) return new Set();
  const { data: creneaux } = await admin.from("benevolat_creneaux").select("id").in("atelier_id", atelierIds);
  const creneauIds = (creneaux || []).map((c) => c.id);
  if (!creneauIds.length) return new Set();
  const { data: inscriptions } = await admin.from("benevolat_inscriptions").select("email").in("creneau_id", creneauIds);
  return new Set((inscriptions || []).map((i) => (i.email || "").toLowerCase()).filter(Boolean));
}

// Liste des destinataires d'un segment, avec l'exclusion éventuelle des
// adresses déjà servies. Commune à l'envoi immédiat, à l'aperçu et au
// lancement d'une campagne programmée (calculée au moment de l'envoi).
async function calculerDestinataires(admin, segment) {
  let destinataires;
  if (segment?.scope === "liste") {
    destinataires = await destinatairesDeListe(admin, segment.adresses);
  } else {
    const familles = await chargerFamilles(admin);
    const correspondantes = famillesCorrespondantes(familles, segment);
    const comptesActives = segment?.sansCompte ? await emailsAvecCompteActive(admin) : null;
    destinataires = destinatairesDe(correspondantes, comptesActives);

    if (inclutContacts(segment)) {
      const { data: contacts } = await admin
        .from("email_contacts")
        .select("id, first_name, last_name, email, email_opt_out");
      const dejaPris = new Set(destinataires.map((d) => d.email.toLowerCase()));
      destinataires.push(...contactsDestinataires(contacts, dejaPris));
    }
  }

  // Relances : on retire ceux qui ont déjà commandé / déjà un créneau bénévole.
  if (segment?.sansCommandeBoutiqueId) {
    const dejaCommande = await emailsAyantCommande(admin, segment.sansCommandeBoutiqueId);
    destinataires = destinataires.filter((d) => !dejaCommande.has((d.email || "").toLowerCase()));
  }
  if (segment?.sansBenevolatEvenementId) {
    const inscrits = await emailsInscritsBenevoles(admin, segment.sansBenevolatEvenementId);
    destinataires = destinataires.filter((d) => !inscrits.has((d.email || "").toLowerCase()));
  }

  let exclusDejaServis = 0;
  if (segment?.exclureDejaServis) {
    const servies = await adressesDejaServies(admin);
    const avant = destinataires.length;
    destinataires = destinataires.filter((d) => !servies.has((d.email || "").toLowerCase()));
    exclusDejaServis = avant - destinataires.length;
  }
  return { destinataires, exclusDejaServis };
}

// Lance les campagnes programmées arrivées à échéance : calcule leurs
// destinataires maintenant, puis les passe « en_cours » (la tâche de fond
// les fait ensuite avancer par vagues). Le passage de 'programme' à
// 'en_cours' est exclusif : aucun double lancement possible.
async function lancerProgrammees(admin) {
  const { data: dues, error } = await admin
    .from("email_campaigns")
    .select("*")
    .eq("status", "programme")
    .lte("programme_le", new Date().toISOString());
  if (error) return { ok: false, error: error.message, lancees: [] };

  const lancees = [];
  for (const c of dues || []) {
    const { destinataires } = await calculerDestinataires(admin, c.segment || {});
    const mailConfigured = isMailConfigured();
    const aEnvoyer = mailConfigured && destinataires.length > 0;
    const { data: pris } = await admin
      .from("email_campaigns")
      .update({
        recipients_count: destinataires.length,
        sent_count: 0,
        mail_configured: mailConfigured,
        status: aEnvoyer ? "en_cours" : "termine",
        next_index: 0,
        recipients: aEnvoyer ? destinataires : [],
        // Ancien exprès : la première vague peut démarrer sans attendre (cf. POST).
        updated_at: new Date(0).toISOString(),
      })
      .eq("id", c.id)
      .eq("status", "programme")
      .select("id");
    if (pris?.length) lancees.push({ id: c.id, destinataires: destinataires.length });
  }
  return { ok: true, lancees };
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

  const { data: boutiques } = await auth.admin.from("boutiques").select("id, name, active").order("position");

  return NextResponse.json({
    boutiques: boutiques || [],
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
  // Création de campagne par une tâche planifiée (e-mail mensuel « nouveautés
  // des partenaires ») : jeton de service, comme /api/admin/emails/continuer.
  const jetonService = process.env.ADMIN_IMPORT_TOKEN;
  const parJeton = Boolean(jetonService) && request.headers.get("x-admin-token") === jetonService;
  const auth = parJeton
    ? { admin: createAdminClient(), parent: { id: null } }
    : await requirePermission(request, "emails");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const corps = await request.json();
  const {
    segment,
    subject,
    contentBlocks,
    dryRun,
    benevolesEvenementId,
    brouillon,
    campaignId,
    brouillonId,
    programmerLe,
  } = corps;

  // Lancement des envois programmés arrivés à échéance : appelé par la tâche
  // de fond Netlify avec le jeton de service, jamais depuis le navigateur.
  if (corps.lancerProgrammees) {
    if (!parJeton) return NextResponse.json({ error: "Réservé à la tâche planifiée." }, { status: 403 });
    return NextResponse.json(await lancerProgrammees(auth.admin));
  }

  // Programmation d'un envoi : le contenu et le segment sont figés comme pour
  // un brouillon ; les destinataires seront calculés à l'heure dite.
  if (programmerLe) {
    const quand = new Date(programmerLe);
    if (Number.isNaN(quand.getTime()) || quand.getTime() < Date.now() + 2 * 60 * 1000) {
      return NextResponse.json(
        { error: "Choisissez une date et une heure dans le futur (au moins quelques minutes)." },
        { status: 400 }
      );
    }
    const blocs = contentBlocks || [];
    if (!subject?.trim() || blocs.length === 0) {
      return NextResponse.json({ error: "Sujet et contenu obligatoires." }, { status: 400 });
    }
    const { data: prog, error: errProg } = await auth.admin
      .from("email_campaigns")
      .insert({
        subject,
        message: renderBlocksToText(blocs),
        html: renderBlocksToHtml(blocs, { subject }),
        content_blocks: blocs,
        segment: segment || {},
        segment_summary: resumeSegment(segment),
        recipients_count: 0,
        sent_count: 0,
        mail_configured: isMailConfigured(),
        created_by: auth.parent.id,
        status: "programme",
        programme_le: quand.toISOString(),
        next_index: 0,
        recipients: [],
        benevoles_evenement_id: benevolesEvenementId || null,
      })
      .select("id")
      .single();
    if (errProg) {
      const manque = /programme_le/i.test(errProg.message);
      return NextResponse.json(
        { error: manque ? "La programmation n'est pas encore activée (migration 0061 à lancer)." : errProg.message },
        { status: manque ? 503 : 500 }
      );
    }
    if (brouillonId) {
      await auth.admin.from("email_campaigns").delete().eq("id", brouillonId).eq("status", "brouillon");
    }
    return NextResponse.json({ ok: true, programme: true, campaignId: prog.id, programmeLe: quand.toISOString() });
  }

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

  const { destinataires, exclusDejaServis } = await calculerDestinataires(auth.admin, segment);

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

// Annule une programmation : la campagne redevient un brouillon (son contenu et
// ses destinataires visés sont conservés, rien n'est envoyé).
export async function PATCH(request) {
  const auth = await requirePermission(request, "emails");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id, action } = await request.json().catch(() => ({}));
  if (!id || action !== "annuler_programmation") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const { data, error } = await auth.admin
    .from("email_campaigns")
    .update({ status: "brouillon", programme_le: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "programme")
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) {
    return NextResponse.json({ error: "Cette campagne n'est plus programmée (déjà lancée ?)." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
