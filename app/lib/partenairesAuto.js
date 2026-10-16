import { sendMail, CONTACT_EMAIL } from "./mail";
import { statutPeriodePartenaire } from "./partenaires";
import { BLUE, GOLD, SITE_URL } from "./emailBlocks";
import {
  JOUR_LIMITE_MESSAGE,
  ajouterJours,
  ajouterMois,
  dateLongue,
  jourParis,
  moisLibelle,
  nomDuMois,
} from "./datesParis";

// E-mails automatiques du Sou vers ses partenaires, et e-mail mensuel « Les
// nouveautés de nos partenaires » vers les familles.
//
//   - le 22 de chaque mois : rappel aux partenaires qui n'ont pas encore
//     envoyé leur message pour la prochaine parution (limite : le 28) ;
//   - 15 jours avant chaque événement : la table pour leurs prospectus ;
//   - le 1er de chaque mois : e-mail aux familles, s'il y a au moins un
//     message validé pour le mois.
//
// Rien n'est jamais envoyé deux fois : chaque envoi est inscrit au journal
// `partenaire_emails_auto` (clé unique) AVANT l'envoi.

// Les envois automatiques ne démarrent pas avant ces dates, pour laisser au
// bureau le temps de relire les aperçus (cf. /admin/partenaires/messages).
export const DEBUT_RAPPELS_PARTENAIRES = "2026-10-22";
export const DEBUT_NEWSLETTER = "2026-11-01";

// Où déposer les documents. À ajuster si la boîte aux lettres du Sou change.
export const LIEU_DEPOT = "dans la boîte aux lettres du Sou des Écoles (1 parvis des enfants d'Izieu, 01090 Montmerle-sur-Saône)";

const esc = (t) =>
  String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// --- Gabarit commun des e-mails vers les partenaires -----------------------
function gabarit({ titre, paragraphes, bouton, note }) {
  const corps = paragraphes
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1e293b;">${p}</p>`)
    .join("");
  const btn = bouton
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;"><tr><td style="border-radius:999px;background:${BLUE};"><a href="${esc(bouton.url)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(bouton.texte)}</a></td></tr></table>`
    : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title>${esc(titre)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:${BLUE};padding:18px 32px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:12px;"><img src="${SITE_URL}/logo/logo-email.png" alt="Logo" width="36" height="36" style="display:block;" /></td>
<td><span style="color:#ffffff;font-size:16px;font-weight:bold;font-family:Georgia,'Times New Roman',serif;">Sou des Écoles Montmerle-Lurcy</span></td>
</tr></table></td></tr>
<tr><td style="padding:30px 32px 10px;">
<h1 style="margin:0 0 18px;font-size:21px;line-height:1.3;color:${BLUE};font-family:Georgia,'Times New Roman',serif;">${esc(titre)}</h1>
${corps}${btn}
</td></tr>
<tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
<p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">${note || "Vous recevez ce message en tant que partenaire du Sou des Écoles Laïques Montmerle-Lurcy."} Pour toute question, répondez directement à cet e-mail.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

const texteDe = (paragraphes, bouton) =>
  paragraphes.map((p) => p.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")).join("\n\n") +
  (bouton ? `\n\n${bouton.texte} : ${bouton.url}` : "");

// --- 1. Rappel du 22 : « il vous reste une semaine » -----------------------
// `parution` : mois de la prochaine parution (AAAA-MM) ; la limite est le 28
// du mois précédent.
export function rappelMensuel({ nom, parution }) {
  const moisLimite = ajouterMois(parution, -1);
  const limite = `${JOUR_LIMITE_MESSAGE} ${nomDuMois(moisLimite)}`;
  const parutionTexte = `1er ${nomDuMois(parution)}`;
  const sujet = `Plus qu'une semaine pour votre actualité de ${nomDuMois(parution)} (avant le ${limite})`;
  const paragraphes = [
    `Bonjour${nom ? ` ${esc(nom)}` : ""},`,
    `Chaque mois, le Sou des Écoles envoie aux familles un e-mail <strong>« Les nouveautés de nos partenaires »</strong>. La prochaine parution aura lieu le <strong>${parutionTexte}</strong>.`,
    `Il vous reste <strong>une semaine</strong> : votre message (titre, texte, lien et, si vous le souhaitez, une image) est à nous envoyer <strong>avant le ${limite}</strong>, depuis votre espace partenaire. Passé cette date, il paraîtra le mois suivant.`,
    `Rien de particulier à annoncer ce mois-ci ? Aucun souci, vous pouvez ignorer ce message : il ne vous est adressé que si vous n'avez pas encore déposé de message pour cette parution.`,
    `Merci de votre soutien aux écoles de Montmerle-Lurcy.<br />Le bureau du Sou des Écoles`,
  ];
  const bouton = { texte: "Rédiger mon message", url: `${SITE_URL}/partenaire` };
  return { sujet, html: gabarit({ titre: "Votre actualité pour les familles", paragraphes, bouton }), texte: texteDe(paragraphes, bouton) };
}

// --- 2. Rappel 15 jours avant un événement : la table des prospectus ------
export function rappelEvenement({ nom, evenement }) {
  const dateTexte = dateLongue(evenement.date_debut);
  const limite = dateLongue(ajouterJours(evenement.date_debut, -2));
  const lieu = evenement.lieu ? ` (${esc(evenement.lieu)})` : "";
  const sujet = `${evenement.name} le ${dateTexte} : une table à votre disposition`;
  const paragraphes = [
    `Bonjour${nom ? ` ${esc(nom)}` : ""},`,
    `Le Sou des Écoles organise <strong>${esc(evenement.name)}</strong> le <strong>${esc(dateTexte)}</strong>${lieu}.`,
    `Comme à chaque événement, nous mettons à votre disposition <strong>une table</strong> pour y présenter vos prospectus, cartes de visite, bons de réduction et autres supports publicitaires.`,
    `Pour cela, merci de nous remettre vos documents <strong>au plus tard 48 heures avant l'événement</strong>, c'est-à-dire avant le <strong>${esc(limite)}</strong> :`,
    `• soit ${esc(LIEU_DEPOT)} ;<br />• soit en main propre à un membre du bureau (répondez à cet e-mail pour convenir d'un moment).`,
    `Nous nous occupons de les installer sur la table le jour J.`,
    `Merci de votre soutien aux écoles de Montmerle-Lurcy.<br />Le bureau du Sou des Écoles`,
  ];
  return { sujet, html: gabarit({ titre: "Une table pour vos documents", paragraphes }), texte: texteDe(paragraphes) };
}

// --- 3. E-mail mensuel aux familles ---------------------------------------
const ORDRE_NIVEAU = { or: 1, argent: 2, bronze: 3 };

// Messages validés du mois, dans l'ordre Or -> Argent -> Bronze ; à niveau
// égal, le partenaire publié le moins récemment passe en premier (rotation).
async function messagesValidesDuMois(admin, mois) {
  const { data: messages } = await admin
    .from("partenaire_messages")
    .select("*")
    .eq("type", "email")
    .eq("statut", "valide")
    .eq("mois_cible", mois);
  if (!messages || messages.length === 0) return [];

  const ids = [...new Set(messages.map((m) => m.partenaire_id))];
  const [{ data: partenaires }, { data: periodes }, { data: precedents }] = await Promise.all([
    admin.from("partenaires").select("id, nom, slug, site_web").in("id", ids),
    admin.from("partenaire_periodes").select("*").in("partenaire_id", ids),
    admin
      .from("partenaire_messages")
      .select("partenaire_id, publie_le")
      .in("partenaire_id", ids)
      .eq("statut", "publie")
      .order("publie_le", { ascending: false }),
  ]);
  const dernierePub = {};
  for (const p of precedents || []) if (!dernierePub[p.partenaire_id]) dernierePub[p.partenaire_id] = p.publie_le;

  return messages
    .map((m) => {
      const p = (partenaires || []).find((x) => x.id === m.partenaire_id);
      const { periodeCourante } = statutPeriodePartenaire((periodes || []).filter((x) => x.partenaire_id === m.partenaire_id));
      return {
        ...m,
        partenaireNom: p?.nom || "Partenaire",
        rang: ORDRE_NIVEAU[periodeCourante?.niveau] || 9,
        derniere: dernierePub[m.partenaire_id] || "",
      };
    })
    .sort((a, b) => a.rang - b.rang || a.derniere.localeCompare(b.derniere) || (a.valide_le || "").localeCompare(b.valide_le || ""));
}

// Image du message rendue accessible depuis n'importe quel client mail : copie
// dans le bucket PUBLIC « email-images » (celui de l'éditeur d'e-mails).
async function urlImagePublique(admin, message, { copier }) {
  if (!message.image_chemin) return null;
  if (!copier) {
    const { data } = await admin.storage.from("partenaire-messages").createSignedUrl(message.image_chemin, 3600);
    return data?.signedUrl || null;
  }
  const { data: fichier, error } = await admin.storage.from("partenaire-messages").download(message.image_chemin);
  if (error || !fichier) return null;
  const ext = (message.image_chemin.split(".").pop() || "jpg").toLowerCase();
  const chemin = `partenaires/${message.id}.${ext}`;
  const buffer = Buffer.from(await fichier.arrayBuffer());
  const { error: up } = await admin.storage
    .from("email-images")
    .upload(chemin, buffer, { contentType: fichier.type || `image/${ext === "jpg" ? "jpeg" : ext}`, upsert: true });
  if (up) return null;
  return admin.storage.from("email-images").getPublicUrl(chemin).data.publicUrl;
}

// Messages d'exemple, uniquement pour l'aperçu quand rien n'est encore validé.
const MESSAGES_EXEMPLE = [
  {
    id: "exemple-1",
    partenaireNom: "Boulangerie Exemple",
    titre: "Nos galettes des rois sont de retour",
    texte:
      "Du 2 au 31 janvier, retrouvez nos galettes à la frangipane, artisanales et faites maison.\nSur présentation de la carte d'adhérent du Sou, une fève en chocolat est offerte avec chaque galette.",
    lien: "https://sou-montmerle.fr/partenaires",
    image_chemin: null,
  },
  {
    id: "exemple-2",
    partenaireNom: "Garage Exemple",
    titre: "Contrôle des pneus avant l'hiver",
    texte: "Passez nous voir pour un contrôle gratuit de vos pneus : sécurité des enfants sur la route, avant tout.",
    lien: null,
    image_chemin: null,
  },
];

// Contenu de l'e-mail aux familles (blocs de l'éditeur d'e-mails). `exemple`
// : si aucun message validé n'existe, montre des messages fictifs (aperçu).
export async function construireNewsletter(admin, mois, { copierImages = false, exemple = false } = {}) {
  let messages = await messagesValidesDuMois(admin, mois);
  let estExemple = false;
  if (messages.length === 0 && exemple) {
    messages = MESSAGES_EXEMPLE;
    estExemple = true;
  }

  const blocs = [];
  let n = 0;
  const id = () => `n${Date.now()}${n++}`;
  blocs.push({ id: id(), type: "heading", text: "Bonjour {{prenom}},", size: "md", color: null });
  blocs.push({
    id: id(),
    type: "paragraph",
    text: "Chaque mois, découvrez les nouveautés des entreprises et commerçants de la région qui soutiennent les écoles de Montmerle-Lurcy.",
    size: "md",
    color: null,
  });
  for (const m of messages) {
    blocs.push({ id: id(), type: "divider" });
    blocs.push({ id: id(), type: "heading", text: m.partenaireNom, size: "sm", color: GOLD });
    blocs.push({ id: id(), type: "heading", text: m.titre, size: "md", color: null });
    blocs.push({ id: id(), type: "paragraph", text: m.texte, size: "md", color: null });
    const urlImage = estExemple ? null : await urlImagePublique(admin, m, { copier: copierImages });
    if (urlImage) blocs.push({ id: id(), type: "image", url: urlImage, alt: m.titre, link: m.lien || "" });
    if (m.lien) blocs.push({ id: id(), type: "button", text: "En savoir plus", url: m.lien, color: "blue" });
  }
  blocs.push({ id: id(), type: "divider" });
  blocs.push({
    id: id(),
    type: "paragraph",
    text: "Rappel : les avantages offerts par nos partenaires sont réservés aux familles à jour de cotisation. Votre carte d'adhérent se trouve dans votre espace famille.",
    size: "sm",
    color: null,
  });
  blocs.push({ id: id(), type: "button", text: "Accéder à mon espace", url: `${SITE_URL}/connexion`, color: "blue" });

  return {
    sujet: `Les nouveautés de nos partenaires — ${moisLibelle(mois)}`,
    blocs,
    messages,
    exemple: estExemple,
  };
}

// Segment de l'e-mail aux familles : toute l'école, les anciens parents et
// les contacts hors famille (cf. docs/conception-espace-partenaires.md §8).
export const SEGMENT_FAMILLES = {
  scope: "personnalise",
  classes: [],
  niveaux: ["maternelle", "elementaire", "anciens"],
  niveauEnfant: [],
  adherents: "tous",
  inclureContacts: true,
};

// --- Partenaires destinataires --------------------------------------------
async function partenairesDestinataires(admin) {
  const [{ data: ps }, { data: periodes }, { data: niveaux }] = await Promise.all([
    admin.from("partenaires").select("id, nom, contact_nom, email, active"),
    admin.from("partenaire_periodes").select("*"),
    admin.from("niveaux_partenaire").select("*"),
  ]);
  return (ps || [])
    .filter((p) => p.active && (p.email || "").includes("@"))
    .map((p) => {
      const { aJour, periodeCourante } = statutPeriodePartenaire((periodes || []).filter((x) => x.partenaire_id === p.id));
      const config = (niveaux || []).find((n) => n.niveau === periodeCourante?.niveau) || null;
      return { ...p, aJour, config, nomAffiche: p.contact_nom || p.nom };
    })
    .filter((p) => p.aJour);
}

// Journal : renvoie true si cet envoi est nouveau (et le réserve), false s'il
// a déjà été fait. Inscrit AVANT l'envoi ; retiré si l'envoi échoue.
async function reserverEnvoi(admin, type, cle, partenaireId = null, detail = null) {
  const { error } = await admin
    .from("partenaire_emails_auto")
    .insert({ type, cle, partenaire_id: partenaireId, detail });
  if (!error) return true;
  if (/duplicate|unique/i.test(error.message || "")) return false;
  throw new Error(error.message);
}
const libererEnvoi = (admin, type, cle) =>
  admin.from("partenaire_emails_auto").delete().eq("type", type).eq("cle", cle);

async function envoyerAuPartenaire(admin, p, type, cle, contenu, detail) {
  if (!(await reserverEnvoi(admin, type, cle, p.id, detail))) return { ignore: true };
  const r = await sendMail({
    to: p.email,
    subject: contenu.sujet,
    html: contenu.html,
    text: contenu.texte,
    replyTo: CONTACT_EMAIL,
  });
  if (!r.sent) {
    await libererEnvoi(admin, type, cle);
    return { echec: true };
  }
  return { envoye: true };
}

// --- Exécution quotidienne --------------------------------------------------
// À appeler une fois par jour (tâche planifiée). Idempotent : peut être
// relancé sans risque. Les fenêtres tolèrent quelques jours de retard (tâche
// manquée) sans jamais renvoyer deux fois.
//   creerCampagne(blocs, sujet, segment) -> { campaignId, recipientsCount }
export async function executerAutomatismes(admin, { maintenant = new Date(), creerCampagne, simulation = false } = {}) {
  const jour = jourParis(maintenant);
  const bilan = { jour: jour.iso, rappelsMensuels: 0, rappelsEvenements: 0, newsletter: null, simulation, notes: [] };

  // 1. Rappel mensuel : du 22 au 27 (si le 22 a été manqué).
  if (jour.iso >= DEBUT_RAPPELS_PARTENAIRES && jour.d >= 22 && jour.d < JOUR_LIMITE_MESSAGE) {
    const parution = ajouterMois(`${jour.y}-${String(jour.m).padStart(2, "0")}`, 1);
    const destinataires = await partenairesDestinataires(admin);
    for (const p of destinataires) {
      if (!p.config || (p.config.quota_email ?? 0) <= 0) continue;
      const { count } = await admin
        .from("partenaire_messages")
        .select("id", { count: "exact", head: true })
        .eq("partenaire_id", p.id)
        .eq("type", "email")
        .eq("mois_cible", parution)
        .in("statut", ["soumis", "valide", "publie"]);
      if ((count || 0) > 0) continue; // a déjà envoyé : pas de rappel
      if (simulation) {
        bilan.rappelsMensuels++;
        continue;
      }
      const r = await envoyerAuPartenaire(admin, p, "rappel_mensuel", `${parution}|${p.id}`, rappelMensuel({ nom: p.nomAffiche, parution }), { parution });
      if (r.envoye) bilan.rappelsMensuels++;
    }
  }

  // 2. Rappel d'événement : 15 jours avant (fenêtre de 15 à 5 jours).
  if (jour.iso >= DEBUT_RAPPELS_PARTENAIRES) {
    const { data: evenements } = await admin
      .from("site_evenements")
      .select("slug, name, date_debut, lieu")
      .eq("visible", true)
      .gte("date_debut", ajouterJours(jour.iso, 5))
      .lte("date_debut", ajouterJours(jour.iso, 15));
    if ((evenements || []).length > 0) {
      const destinataires = await partenairesDestinataires(admin);
      for (const ev of evenements) {
        for (const p of destinataires) {
          if (simulation) {
            bilan.rappelsEvenements++;
            continue;
          }
          const r = await envoyerAuPartenaire(
            admin,
            p,
            "rappel_evenement",
            `${ev.slug}|${ev.date_debut}|${p.id}`,
            rappelEvenement({ nom: p.nomAffiche, evenement: ev }),
            { evenement: ev.name }
          );
          if (r.envoye) bilan.rappelsEvenements++;
        }
      }
    }
  }

  // 3. E-mail aux familles : le 1er du mois (jusqu'au 3 si manqué), s'il y a
  //    au moins un message validé pour le mois.
  if (jour.iso >= DEBUT_NEWSLETTER && jour.d <= 3) {
    const mois = `${jour.y}-${String(jour.m).padStart(2, "0")}`;
    const { data: dejaFait } = await admin
      .from("partenaire_emails_auto")
      .select("id")
      .eq("type", "newsletter")
      .eq("cle", mois)
      .maybeSingle();
    if (dejaFait) {
      bilan.newsletter = "déjà envoyé";
    } else {
      const contenu = await construireNewsletter(admin, mois, { copierImages: !simulation });
      if (contenu.messages.length === 0) {
        bilan.newsletter = "aucun message validé : pas d'e-mail ce mois-ci";
      } else if (simulation) {
        bilan.newsletter = `${contenu.messages.length} message(s) à envoyer`;
      } else if (await reserverEnvoi(admin, "newsletter", mois, null, { messages: contenu.messages.length })) {
        try {
          const c = await creerCampagne(contenu.blocs, contenu.sujet, SEGMENT_FAMILLES);
          bilan.newsletter = `campagne créée (${c.recipientsCount} destinataires)`;
          await admin
            .from("partenaire_messages")
            .update({ statut: "publie", publie_le: new Date().toISOString() })
            .in("id", contenu.messages.map((m) => m.id));
        } catch (e) {
          await libererEnvoi(admin, "newsletter", mois);
          bilan.newsletter = `échec : ${e.message}`;
        }
      }
    }
    // Messages déposés mais jamais validés à temps : on les reporte au mois
    // suivant plutôt que de les perdre.
    if (!simulation) {
      const { data: enRetard } = await admin
        .from("partenaire_messages")
        .update({ mois_cible: ajouterMois(mois, 1) })
        .eq("type", "email")
        .eq("statut", "soumis")
        .eq("mois_cible", mois)
        .select("id");
      if ((enRetard || []).length > 0) bilan.notes.push(`${enRetard.length} message(s) non validé(s) reporté(s) à ${moisLibelle(ajouterMois(mois, 1))}`);
    }
  }

  return bilan;
}

// Aperçu d'un des e-mails pour le bureau.
export async function apercuEmail(admin, type, { mois } = {}) {
  const jour = jourParis();
  if (type === "rappel_mensuel") {
    const parution = mois || ajouterMois(`${jour.y}-${String(jour.m).padStart(2, "0")}`, 1);
    return rappelMensuel({ nom: "Prénom Nom", parution });
  }
  if (type === "rappel_evenement") {
    const { data } = await admin
      .from("site_evenements")
      .select("slug, name, date_debut, lieu")
      .eq("visible", true)
      .gte("date_debut", jour.iso)
      .order("date_debut", { ascending: true })
      .limit(1);
    const ev = data?.[0] || { name: "Marché de Noël", date_debut: "2026-11-28", lieu: "Place du marché" };
    return rappelEvenement({ nom: "Prénom Nom", evenement: ev });
  }
  return null;
}

