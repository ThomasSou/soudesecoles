import { CONTACT_EMAIL, sendMail } from "./mail";
import {
  entetesDesinscription,
  renderBlocksToHtml,
  renderBlocksToText,
} from "./emailBlocks";
import { chargerPlanningEvenementBorne } from "./benevolesPlanning";

// Envoi des campagnes e-mail par vagues.
//
// Une campagne "Toute l'école" vise ~450 familles. Envoyer tout ça dans une
// seule requête ne passe pas : la fonction serveur (Netlify) a un temps
// d'exécution maximum, et un hébergeur mail classique n'aime pas un pic de
// centaines d'envois d'un coup. On découpe donc en vagues : chaque appel
// traite TAILLE_VAGUE destinataires, enregistre l'avancement sur la ligne
// email_campaigns (next_index, sent_count, status), puis rend la main. Le
// front enchaîne les vagues avec une courte pause. Si l'envoi est
// interrompu (onglet fermé, fonction coupée), il reprend à next_index.
// Petites vagues : chaque appel /continuer doit finir largement avant le
// plafond d'exécution Netlify, même si Sender répond lentement.
export const TAILLE_VAGUE = 5;

// Pause entre deux envois d'une même vague. Un compte Sender neuf se met à
// ralentir/refuser s'il reçoit une rafale ; on espace donc les appels.
const PAUSE_ENTRE_ENVOIS_MS = 800;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// Envoie la prochaine vague d'une campagne "en_cours" et met à jour son
// avancement. L'avancement est écrit après CHAQUE e-mail : si la fonction
// est coupée en plein milieu, la reprise repart exactement au bon endroit,
// sans doublon ni oubli.
export async function envoyerVague(admin, campagne) {
  const tous = Array.isArray(campagne.recipients) ? campagne.recipients : [];
  const total = campagne.recipients_count || tous.length;
  const blocks = campagne.content_blocks || [];
  const subject = campagne.subject;

  // Planning bénévoles éventuel : rechargé à chaque vague pour que les places
  // restantes reflètent l'instant de l'envoi (les vagues s'étalent sur
  // plusieurs minutes).
  const planning = campagne.benevoles_evenement_id
    ? await chargerPlanningEvenementBorne(admin, campagne.benevoles_evenement_id)
    : null;

  let index = campagne.next_index || 0;
  let sentCount = campagne.sent_count || 0;
  // Bilan des canaux réellement utilisés. Persisté dans `segment` (jsonb déjà
  // présent, pas de colonne dédiée) pour survivre à une reprise d'envoi.
  const segment = { ...(campagne.segment || {}) };
  const canaux = { sender: 0, smtp: 0, ...(segment.canaux || {}) };
  const fin = Math.min(index + TAILLE_VAGUE, total);

  for (let i = index; i < fin; i += 1) {
    const dest = tous[i];
    if (i > index) await attendre(PAUSE_ENTRE_ENVOIS_MS);
    if (dest && dest.email) {
      const res = await sendMail({
        to: dest.email,
        subject,
        text: renderBlocksToText(blocks, { recipient: dest, planning }),
        html: renderBlocksToHtml(blocks, { subject, recipient: dest, planning }),
        replyTo: CONTACT_EMAIL,
        headers: entetesDesinscription(dest, { contactEmail: CONTACT_EMAIL }),
      });
      if (res.sent) {
        sentCount += 1;
        if (res.via === "sender" || res.via === "smtp") canaux[res.via] += 1;
      }
    }
    index = i + 1;
    await admin
      .from("email_campaigns")
      .update({
        next_index: index,
        sent_count: sentCount,
        segment: { ...segment, canaux },
        updated_at: new Date().toISOString(),
      })
      .eq("id", campagne.id);
  }

  const termine = index >= total;
  if (termine) {
    // Bilan des canaux ajouté au résumé, pour savoir a posteriori si l'envoi
    // est bien parti par Sender (chauffe de réputation) ou par le SMTP.
    const bilan =
      canaux.sender || canaux.smtp
        ? `${campagne.segment_summary || ""} · ${canaux.sender} via Sender, ${canaux.smtp} via SMTP`.trim()
        : campagne.segment_summary;
    await admin
      .from("email_campaigns")
      .update({
        status: "termine",
        segment_summary: bilan,
        // La liste des adresses ne sert plus une fois l'envoi terminé.
        recipients: [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", campagne.id);
  }

  return { done: termine, sentCount, recipientsCount: total };
}
