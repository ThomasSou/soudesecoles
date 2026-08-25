-- Suivi des invitations envoyées aux parents (compte de connexion).
-- Jusqu'ici, l'envoi passait entièrement par Supabase Auth
-- (inviteUserByEmail), qui limite le nombre d'e-mails envoyés par heure —
-- bloquant pour inviter les 400+ familles d'un coup. La solution : ne
-- demander à Supabase que de générer le lien d'activation (sans envoyer de
-- mail), puis envoyer nous-mêmes l'e-mail via un prestataire d'envoi en
-- masse (Sender), qui fournit en prime le suivi ouverture/clic.
--
-- Tant que SENDER_API_KEY n'est pas configuré (cf. app/lib/senderMail.js),
-- le code continue d'utiliser inviteUserByEmail comme avant : cette table
-- reste vide et rien ne change.

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references parents(id) on delete set null,
  email text not null,
  provider_message_id text,
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  bounce_reason text,
  -- Historique brut des évènements reçus du prestataire, au cas où le nom
  -- exact des champs du webhook diffère de ce qu'on attend au départ : rien
  -- n'est perdu, on peut toujours relire/ajuster après coup.
  raw_events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_invitations_email on invitations(email);
create index if not exists idx_invitations_provider_message_id
  on invitations(provider_message_id);

alter table invitations enable row level security;
-- Pas de policy publique : uniquement accessible via les routes API serveur
-- (back-office et webhook du prestataire), comme le reste du back-office.
