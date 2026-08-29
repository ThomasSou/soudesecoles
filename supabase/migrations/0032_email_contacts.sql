-- Contacts légers pour l'envoi de campagnes e-mail, sans fiche famille
-- complète : une personne dont l'e-mail a été récolté (nouvelle inscription
-- CSV...) mais qui n'a ni enfant scolarisé connu, ni compte de connexion.
-- Nommée "email_contacts" (et non "contacts") pour ne pas se confondre avec
-- app/api/admin/emails/contacts/route.js, qui liste les destinataires
-- dérivés de `parents` pour l'aperçu de campagne — un concept différent.

create table if not exists email_contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  email text not null,
  email_opt_out boolean not null default false,
  source text,
  created_at timestamptz not null default now()
);

create unique index if not exists email_contacts_email_key
  on email_contacts (lower(email));

alter table email_contacts enable row level security;
-- Pas de policy publique : lecture/écriture via routes API serveur uniquement.
