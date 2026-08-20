-- Permissions individuelles paramétrables pour le back-office : chaque
-- personne admise dans le back-office (is_admin = true) reçoit un jeu de
-- droits indépendants, activables/désactivables un par un, plutôt que deux
-- rôles figés. On garde la colonne `role` pour compatibilité historique mais
-- elle n'est plus utilisée pour l'autorisation.

alter table parents add column if not exists is_admin boolean not null default false;
alter table parents add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table parents add column if not exists title text;

-- Migration des comptes déjà promus avec l'ancien système à 2 rôles.
update parents
  set is_admin = true,
      permissions = '{"familles":true,"demandes":true,"messages":true,"emails":true,"acces":true}'::jsonb
  where role = 'admin_general' and is_admin = false;

update parents
  set is_admin = true,
      permissions = '{"familles":false,"demandes":false,"messages":false,"emails":false,"acces":false}'::jsonb
  where role = 'admin_commission' and is_admin = false;

-- Historique des campagnes d'e-mails envoyées depuis le back-office
-- (accessible uniquement via la clé de service, pas de policy client).
create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  message text not null,
  segment jsonb not null default '{}'::jsonb,
  segment_summary text,
  recipients_count integer not null default 0,
  sent_count integer not null default 0,
  mail_configured boolean not null default false,
  created_by uuid references parents(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table email_campaigns enable row level security;
