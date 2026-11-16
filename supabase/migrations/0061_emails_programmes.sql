-- ============================================================================
-- E-MAILS — envoi programmé (date et heure choisies par le bureau).
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un `select` indépendant — le message
-- « Success » de l'éditeur peut être périmé. Idempotente.
--
-- Une campagne programmée est une ligne email_campaigns de statut 'programme'
-- (la colonne `status` est un simple texte, sans contrainte à modifier) avec
-- sa date dans `programme_le`. Les destinataires NE sont PAS figés à la
-- programmation : ils sont calculés au moment de l'envoi, à partir du segment
-- enregistré (une famille inscrite entre-temps est prise en compte, un
-- désinscrit est exclu). La tâche planifiée Netlify (toutes les 10 minutes)
-- lance les campagnes arrivées à échéance : l'envoi démarre donc au plus tard
-- 10 minutes après l'heure choisie.
-- ============================================================================

alter table email_campaigns add column if not exists programme_le timestamptz;
create index if not exists idx_email_campaigns_programme
  on email_campaigns (programme_le) where status = 'programme';

-- Vérif :
-- select count(*) from information_schema.columns
--  where table_name = 'email_campaigns' and column_name = 'programme_le';
--   attendu : 1
