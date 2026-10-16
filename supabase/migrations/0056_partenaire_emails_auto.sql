-- ============================================================================
-- PARTENAIRES — e-mails automatiques + avantages toujours réservés aux
-- familles à jour de cotisation.
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un `select` indépendant — le message
-- « Success » de l'éditeur peut être périmé. Idempotente.
--
-- 1. partenaire_emails_auto : journal des envois automatiques, pour ne JAMAIS
--    envoyer deux fois le même message (la tâche planifiée tourne chaque jour).
--      type 'rappel_mensuel'   cle '2026-11|<partenaire_id>'
--                              (rappel du 22 : parution du 1er novembre)
--      type 'rappel_evenement' cle '<slug>|<date>|<partenaire_id>'
--                              (table pour les prospectus, 15 jours avant)
--      type 'newsletter'       cle '2026-11'
--                              (« Les nouveautés de nos partenaires »)
--    Une ligne unique par (type, cle).
--
-- 2. Règle du Sou : un avantage est TOUJOURS réservé aux familles à jour de
--    cotisation. Le code l'impose désormais partout ; cette requête remet en
--    conformité les avantages qui auraient été créés « ouverts à tous ».
--
-- RLS activé, AUCUNE policy publique : tout passe par les routes serveur.
-- ============================================================================

begin;

create table if not exists partenaire_emails_auto (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('rappel_mensuel', 'rappel_evenement', 'newsletter')),
  cle text not null,
  partenaire_id uuid references partenaires(id) on delete set null,
  envoye_le timestamptz not null default now(),
  detail jsonb,
  unique (type, cle)
);

create index if not exists idx_partenaire_emails_auto_type on partenaire_emails_auto (type, envoye_le);

alter table partenaire_emails_auto enable row level security;
-- Pas de policy publique : lecture et écriture par les routes serveur.

update avantages set requiert_adhesion = true where requiert_adhesion is distinct from true;

-- Vérif après commit :
-- select (select count(*) from partenaire_emails_auto) as journal,
--        (select count(*) from avantages where requiert_adhesion is distinct from true) as avantages_ouverts;
--   attendu : 0 et 0

rollback;  -- <<< remplacer par "commit;" après relecture
