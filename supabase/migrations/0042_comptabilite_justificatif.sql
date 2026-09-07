-- ============================================================================
-- COMPTABILITÉ — justificatif (devis / facture) sur une ligne.
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un select indépendant.
--
-- Idempotente : sans effet si elle a déjà été passée (utile si une première
-- version, sans `justificatif_type`, a déjà été lancée — relancer celle-ci
-- ajoute simplement la colonne manquante).
--
-- Le fichier est stocké dans le bucket privé `remboursements` (créé par 0024,
-- déjà réutilisé par l'espace enseignant) sous le préfixe
-- `comptabilite/<ligne_id>/...`. Aucune URL publique : la consultation passe
-- par une URL signée de courte durée (GET /api/admin/comptabilite/[id]/fichier).
--
-- `justificatif_type` : nature du document joint.
--   devis               -> simple devis, montant non engagé
--   facture_provisoire  -> facture reçue mais pas encore définitive
--   facture_definitive  -> facture définitive (le voyant ne passe au vert
--                          que dans ce cas)
--
-- Les lignes recopiées d'une facture enseignant (source = 'enseignant')
-- n'ont pas de fichier propre : le justificatif est celui de la fiche
-- enseignant (teacher_invoices.invoice_file_path), servi par la même route,
-- et compté comme une facture définitive.
-- ============================================================================

alter table compta_lignes
  add column if not exists justificatif_path text;

alter table compta_lignes
  add column if not exists justificatif_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'compta_lignes_justificatif_type_chk'
  ) then
    alter table compta_lignes
      add constraint compta_lignes_justificatif_type_chk
      check (
        justificatif_type is null
        or justificatif_type in ('devis', 'facture_provisoire', 'facture_definitive')
      );
  end if;
end $$;
