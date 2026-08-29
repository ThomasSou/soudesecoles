// Envoi transactionnel via Sender (sender.net) : utilisé pour les
// invitations aux 400+ familles, que Supabase Auth ne peut pas envoyer
// lui-même (limite d'e-mails par heure, quel que soit le SMTP configuré
// derrière). Tant que SENDER_API_KEY n'est pas défini, isSenderConfigured()
// renvoie faux et le code appelant continue d'utiliser l'ancien circuit
// (inviteUserByEmail) : rien ne change tant que Thomas n'a pas créé le
// compte Sender et ajouté la variable sur Netlify.
//
// Variables attendues :
//   SENDER_API_KEY=...
//   SENDER_FROM_EMAIL=contact@sou-montmerle.fr
//   SENDER_FROM_NAME="Sou des Écoles Montmerle-Lurcy"

export function isSenderConfigured() {
  return Boolean(process.env.SENDER_API_KEY && process.env.SENDER_FROM_EMAIL);
}

// Envoie un e-mail transactionnel unique. Renvoie l'identifiant de message
// donné par Sender quand il est présent dans la réponse (utile pour
// recouper les évènements de webhook), sinon null : le recoupement se fait
// alors par adresse e-mail (cf. app/api/emails/sender-webhook).
// Délai maximum pour un appel à l'API Sender. La fonction serveur (Netlify)
// a elle-même un plafond d'exécution : si Sender ne répond pas, mieux vaut
// échouer nettement ici — ce qui laisse jouer le repli SMTP (cf. mail.js) —
// que de laisser la requête pendre jusqu'à ce que Netlify coupe tout et
// renvoie une page d'erreur.
const SENDER_TIMEOUT_MS = 8000;

export async function envoyerEmailTransactionnel({ to, toName, subject, html, text, replyTo, headers }) {
  const entetes = { ...(headers || {}) };
  if (replyTo) entetes["Reply-To"] = replyTo;

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), SENDER_TIMEOUT_MS);

  let res;
  try {
    res = await fetch("https://api.sender.net/v2/message/send", {
      method: "POST",
      signal: controleur.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SENDER_API_KEY}`,
      },
      body: JSON.stringify({
        from: {
          email: process.env.SENDER_FROM_EMAIL,
          name: process.env.SENDER_FROM_NAME || "Sou des Écoles Montmerle-Lurcy",
        },
        to: { email: to, name: toName || undefined },
        subject,
        html,
        text,
        headers: Object.keys(entetes).length ? entetes : undefined,
      }),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Sender n'a pas répondu en ${SENDER_TIMEOUT_MS / 1000} s.`);
    }
    throw error;
  } finally {
    clearTimeout(minuteur);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.message || `Sender a refusé l'envoi (${res.status}).`);
  }

  return { messageId: data?.data?.id || data?.id || null };
}
