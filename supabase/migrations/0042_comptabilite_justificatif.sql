-- ============================================================================
-- COMPTABILITÉ — justificatif (facture PDF ou image) sur une ligne.
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un select indépendant.
--
-- Le fichier est stocké dans le bucket privé `remboursements` (créé par 0024,
-- déjà réutilisé par l'espace enseignant) sous le préfixe
-- `comptabilite/<ligne_id>/...`. Aucune URL publique : la consultation passe
-- par une URL signée de courte durée (GET /api/admin/comptabilite/[id]/fichier).
--
-- Les lignes recopiées d'une facture enseignant (source = 'enseignant')
-- n'ont pas de fichier propre : le justificatif est celui de la fiche
-- enseignant (teacher_invoices.invoice_file_path), servi par la même route.
-- ============================================================================

alter table compta_lignes
  add column if not exists justificatif_path text;
