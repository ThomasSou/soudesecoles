-- ============================================================================
-- BOUTIQUE — raison d'un refus HelloAsso à la création du paiement.
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un `select` indépendant — le message
-- « Success » de l'éditeur peut être périmé. Idempotente.
--
-- Une commande passe « failed » quand HelloAsso refuse de créer le paiement
-- (avant même que l'acheteur arrive sur sa page de paiement) ; son message
-- d'erreur n'était pas conservé. On le garde ici, et il s'affiche sur la
-- commande dans le back-office. Rempli aussi quand un premier essai refusé a
-- été rattrapé par le second (libellé neutre), pour comprendre la cause.
-- ============================================================================

alter table shop_orders add column if not exists erreur_paiement text;

-- Vérif :
-- select count(*) from information_schema.columns
--  where table_name = 'shop_orders' and column_name = 'erreur_paiement';
--   attendu : 1
