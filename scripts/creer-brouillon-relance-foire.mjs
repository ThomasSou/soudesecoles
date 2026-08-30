#!/usr/bin/env node
/**
 * Crée en base la campagne « Relance Foire » comme BROUILLON, sans avoir à la
 * re-saisir bloc par bloc dans l'éditeur /admin/emails.
 *
 * C'est le mail 2 de la rentrée : une relance courte et distincte du mail
 * « Bonne rentrée » (celui-là parle du site et de l'adhésion). Ici on met en
 * avant les précommandes de repas sur la boutique et l'inscription aux
 * créneaux bénévoles pour la Foire des 4 et 5 septembre. Cible d'envoi : le
 * mercredi qui précède, à tout le monde (y compris ceux qui ont déjà reçu le
 * mail de rentrée : message différent, pas un doublon).
 *
 * Pas de planning de créneaux injecté (benevoles_evenement_id = null) : le
 * tableau complet fait ~60 lignes, illisible en e-mail et vite périmé. Un
 * paragraphe court + un bouton vers /benevoles suffit.
 *
 * Usage :
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     node scripts/creer-brouillon-relance-foire.mjs
 *
 * Réversible : le brouillon est supprimable via le bouton « Supprimer » de
 * l'historique dans /admin/emails.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("Variables NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY requises.");
  process.exit(1);
}

const SUBJECT = "La Foire de Montmerle, c'est ce week-end — un coup de main ?";

// Fabrique de blocs, alignée sur app/lib/emailBlocks.js (newBlock).
let n = 0;
const id = () => `b${String(++n).padStart(4, "0")}`;
const titre = (text) => ({ id: id(), type: "heading", text, size: "md", color: null });
const para = (text) => ({ id: id(), type: "paragraph", text, size: "md", color: null });
const bouton = (text, url, color = "blue") => ({ id: id(), type: "button", text, url, color });

const blocs = [
  titre("Bonjour {{prenom}},"),
  para(
    "La Foire de Montmerle a lieu ce vendredi 4 et samedi 5 septembre. C'est l'un des grands rendez-vous de l'année pour le Sou des Écoles, et l'une de nos principales sources de financement pour les projets des enfants. Voici comment vous pouvez y participer."
  ),

  titre("Précommandez vos repas"),
  para(
    "La buvette du Sou vous accueille vendredi soir, samedi midi et samedi soir : jambon à la broche, rôti de dinde, menus moules et andouillettes le samedi, sans oublier les cocktails. Précommander votre repas sur la boutique en ligne nous aide beaucoup à prévoir les quantités — et vous évite l'attente sur place."
  ),
  bouton("Précommander sur la boutique", "https://sou-montmerle.fr/boutique", "blue"),

  titre("Donnez un coup de main"),
  para(
    "La Foire demande beaucoup de bénévoles, sur de nombreux créneaux : tenue de la buvette, service, installation, rangement. Même 1h30 sur un créneau, c'est une vraie aide. Vous pouvez choisir le vôtre en ligne, selon vos disponibilités."
  ),
  bouton("Voir les créneaux et m'inscrire", "https://sou-montmerle.fr/benevoles", "blue"),

  titre("Le programme en bref"),
  para(
    "Vendredi 4 septembre dès 19h : banquet gallo-romain, défis en famille, feu d'artifice à 22h (le feu d'artifice du 14 juillet, reporté).\nSamedi 5 septembre dès 10h : foire commerciale, spectacles équestres, animations, soirée DJ et quiz."
  ),

  para(
    "Merci pour votre soutien, et à ce week-end.\nL'équipe du Sou des Écoles Laïques Montmerle-Lurcy"
  ),
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
    benevoles_evenement_id: null,
    created_by: null,
  })
  .select("id")
  .single();

if (error) {
  console.error("Échec de la création du brouillon :", error.message);
  process.exit(1);
}

console.log(`Brouillon créé : email_campaigns.id = ${data.id}`);
console.log(`${blocs.length} blocs, sujet « ${SUBJECT} », sans planning injecté.`);
console.log("→ /admin/emails → « Historique et brouillons » → « Modifier ce brouillon ».");
