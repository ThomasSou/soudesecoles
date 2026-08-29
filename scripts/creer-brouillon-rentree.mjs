#!/usr/bin/env node
/**
 * Crée en base la campagne de rentrée 2026 comme BROUILLON, sans avoir à la
 * re-saisir bloc par bloc dans l'éditeur /admin/emails.
 *
 * Contexte : le contenu avait été perdu (état client non persisté) puis la
 * re-saisie manuelle a buté sur une session admin expirée. Ce script insère
 * directement une ligne email_campaigns en statut 'brouillon' avec les 20
 * blocs. Ensuite : /admin/emails → « Modifier ce brouillon » → relecture →
 * envoi. Réversible : le brouillon est supprimable via le bouton
 * « Supprimer » de l'historique.
 *
 * Usage :
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     node scripts/creer-brouillon-rentree.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("Variables NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY requises.");
  process.exit(1);
}

// Événement bénévoles dont le planning des créneaux sera inséré à l'envoi.
const FOIRE_2026_ID = "6c60531d-1cf4-47ff-89a3-3cf9998aee84";

const SUBJECT = "Bonne rentrée — votre espace famille du Sou des Écoles";

// Fabrique de blocs, alignée sur app/lib/emailBlocks.js (newBlock).
let n = 0;
const id = () => `b${String(++n).padStart(4, "0")}`;
const titre = (text) => ({ id: id(), type: "heading", text, size: "md", color: null });
const para = (text) => ({ id: id(), type: "paragraph", text, size: "md", color: null });
const bouton = (text, url, color = "blue") => ({ id: id(), type: "button", text, url, color });

const blocs = [
  titre("Bonjour {{prenom}},"),
  para(
    "Toute l'équipe du Sou des Écoles Laïques de Montmerle-Lurcy vous souhaite une très belle rentrée."
  ),

  titre("Vous recevez peut-être ce message par erreur"),
  para(
    "Nous travaillons encore à partir des listes de l'an dernier. Si votre enfant n'est plus scolarisé à l'école Mick Micheyl, veuillez nous excuser : vous pouvez ne pas tenir compte de ce message, nous vous retirerons de la liste."
  ),

  titre("Un nouveau site internet"),
  para(
    "Le Sou des Écoles a un nouveau site : [sou-montmerle.fr](https://sou-montmerle.fr). Il n'est pas encore tout à fait terminé, mais vous pouvez dès maintenant y créer et utiliser votre espace famille : adhésion en ligne, carte d'adhérent, historique de vos participations aux manifestations, et réception des informations de l'association."
  ),
  para(
    "Pour y accéder, rendez-vous sur la page de connexion. Si vous n'avez pas encore de mot de passe, cliquez sur « Mot de passe oublié » : votre adresse e-mail est déjà enregistrée, vous n'avez plus qu'à en choisir un. Si votre famille n'apparaît pas du tout, faites votre [demande d'inscription](https://sou-montmerle.fr/inscription)."
  ),
  bouton("Accéder à mon espace famille", "https://sou-montmerle.fr/connexion", "blue"),

  titre("Les informations affichées sont celles de l'an dernier"),
  para(
    "Elles seront mises à jour dès que nous recevrons les listes des écoles. En attendant, vous pouvez déjà vérifier votre fiche famille. Si vous repérez une erreur (mauvais rapprochement entre parents et enfants, enfant manquant ou en trop, coordonnées inexactes), écrivez-nous à contact@sou-montmerle.fr ou via le [formulaire de contact](https://sou-montmerle.fr/contact). Nous nous en occupons et nous vous prions de nous excuser pour la gêne, le temps que tout se mette en place."
  ),

  titre("Le site est encore en développement"),
  para(
    "Si vous rencontrez un problème, un bug, ou si vous avez une idée d'amélioration, n'hésitez pas à nous le signaler à contact@sou-montmerle.fr. Vos retours nous sont très utiles."
  ),

  titre("Adhésion 2026-2027 : c'est ouvert"),
  para("Vous pouvez dès maintenant adhérer pour l'année 2026-2027 depuis votre espace adhérent."),
  para(
    "La grande nouveauté de cette année : chaque famille adhérente bénéficie d'une boisson offerte à chacun des événements du Sou (Foire, loto, fête de l'école…). Il suffit de présenter votre carte d'adhérent et son QR code sur place."
  ),
  bouton("Adhérer pour 2026-2027", "https://sou-montmerle.fr/espace-adherent", "gold"),

  titre("La Foire de Montmerle approche — nous avons besoin de vous"),
  para(
    "Les 4 et 5 septembre, la Foire de Montmerle est l'un des temps forts de l'année pour le Sou des Écoles et l'une de nos principales sources de financement pour les projets des enfants. Elle demande un très grand nombre de bénévoles, sur de nombreux créneaux. Même une heure ou deux, c'est précieux."
  ),
  para(
    "Merci pour votre confiance et votre soutien.\nL'équipe du Sou des Écoles Laïques Montmerle-Lurcy"
  ),
  bouton("Voir les créneaux et m'inscrire", "https://sou-montmerle.fr/benevoles", "blue"),
];

// Version texte simple pour la colonne message (NOT NULL). Le vrai rendu
// (HTML + texte) est régénéré au moment de l'envoi réel.
const messageTexte = blocs
  .filter((b) => b.type === "heading" || b.type === "paragraph" || b.type === "button")
  .map((b) => {
    const t = (b.text || "")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
      .replace(/\*\*([^*]+)\*\*/g, "$1");
    return b.type === "button" ? `${t} : ${b.url}` : t;
  })
  .join("\n\n");

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin
  .from("email_campaigns")
  .insert({
    subject: SUBJECT,
    message: messageTexte,
    html: null,
    content_blocks: blocs,
    segment: {},
    segment_summary: "Brouillon",
    recipients_count: 0,
    sent_count: 0,
    mail_configured: true,
    status: "brouillon",
    next_index: 0,
    recipients: [],
    benevoles_evenement_id: FOIRE_2026_ID,
    created_by: null,
  })
  .select("id")
  .single();

if (error) {
  console.error("Échec de la création du brouillon :", error.message);
  process.exit(1);
}

console.log(`Brouillon créé : email_campaigns.id = ${data.id}`);
console.log(`${blocs.length} blocs, sujet « ${SUBJECT} », planning Foire 2026.`);
console.log("→ /admin/emails → « Historique et brouillons » → « Modifier ce brouillon ».");
