-- Suivi des campagnes e-mail : compteurs agrégés + détail par destinataire.
-- À appliquer à la main dans l'éditeur SQL Supabase (numéro provisoire).
--
-- Choix de conception : AUCUN suivi d'ouverture ni de clic PAR PERSONNE, pour
-- rester cohérent avec la mesure d'audience du site (sans cookie, sans
-- identifiant de visiteur). Les ouvertures sont un simple compteur par
-- campagne. La table email_campaign_recipients ne conserve que le FAIT
-- TECHNIQUE de livraison (adresse, statut, canal) — voir la note vie privée
-- dans app/confidentialite/page.js à compléter par Thomas.

alter table email_campaigns
  add column if not exists opens_count integer not null default 0;

alter table email_campaigns
  add column if not exists unsub_count integer not null default 0;

-- Une ligne par destinataire d'une campagne, écrite au fil de l'envoi.
create table if not exists email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  email text not null,
  prenom text,
  statut text not null default 'envoye',   -- envoye | echec | ignore
  canal text,                              -- sender | smtp | null
  envoye_le timestamptz not null default now()
);

create index if not exists email_campaign_recipients_campaign_idx
  on email_campaign_recipients (campaign_id);

alter table email_campaign_recipients enable row level security;
-- Pas de policy publique : lecture/écriture via routes API serveur uniquement.
