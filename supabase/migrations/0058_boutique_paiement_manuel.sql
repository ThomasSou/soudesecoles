-- ============================================================================
-- BOUTIQUE — commande marquée « payée » à la main (chèque, espèces).
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un `select` indépendant — le message
-- « Success » de l'éditeur peut être périmé. Idempotente.
--
-- Garde la trace de COMMENT une commande a été réglée hors HelloAsso, pour la
-- comptabilité : mode (cheque / especes) et note libre (n° de chèque, nom du
-- bénévole qui a encaissé...). Les commandes réglées par HelloAsso les laissent vides.
-- ============================================================================

begin;

alter table shop_orders add column if not exists paiement_mode text
  check (paiement_mode in ('cheque', 'especes') or paiement_mode is null);
alter table shop_orders add column if not exists paiement_note text;

-- Vérif après commit :
-- select column_name from information_schema.columns
--  where table_name = 'shop_orders' and column_name in ('paiement_mode', 'paiement_note');
--   attendu : 2 lignes

rollback;  -- <<< remplacer par "commit;" après relecture
