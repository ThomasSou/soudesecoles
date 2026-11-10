-- ============================================================================
-- COMPTABILITÉ — référence du règlement d'une dépense : n° de chèque, ou
-- référence du virement. Sert surtout aux factures de fournisseurs saisies
-- via l'espace enseignant et réglées par le Sou (ex. un chèque n° 1234567).
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un `select` indépendant — le message
-- « Success » de l'éditeur peut être périmé. Idempotente.
-- ============================================================================

alter table compta_lignes add column if not exists paiement_reference text;

-- Vérif :
-- select count(*) from information_schema.columns
--  where table_name = 'compta_lignes' and column_name = 'paiement_reference';
--   attendu : 1
