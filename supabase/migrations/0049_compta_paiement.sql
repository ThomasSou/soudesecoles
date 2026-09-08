-- ============================================================================
-- COMPTABILITÉ — état de paiement d'une facture : « à payer » / « payée », et
-- par quel moyen (virement, chèque, carte, espèces, prélèvement, autre).
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un `select` indépendant — le message
-- « Success » de l'éditeur peut être périmé. Idempotente.
--
--   paiement_statut NULL       -> ligne non concernée : recettes, factures
--                                 enseignant (pilotées depuis leur fiche),
--                                 avances bénévoles (suivi propre via
--                                 rembourse_le). Rien à afficher.
--   paiement_statut 'a_payer'  -> facture saisie, pas encore réglée (badge
--                                 rouge). C'est la valeur par défaut d'une
--                                 dépense saisie à la main et réglée par le
--                                 Sou ; elle est déduite à l'affichage, la
--                                 colonne n'est écrite que lorsque le bureau
--                                 renseigne le paiement (compat : la saisie
--                                 reste possible avant cette migration).
--   paiement_statut 'paye'     -> réglée. moyen_paiement précise comment,
--                                 paiement_le porte la date (facultative).
-- ============================================================================

alter table compta_lignes add column if not exists paiement_statut text;
alter table compta_lignes add column if not exists moyen_paiement text;
alter table compta_lignes add column if not exists paiement_le date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compta_lignes_paiement_statut_chk') then
    alter table compta_lignes add constraint compta_lignes_paiement_statut_chk
      check (paiement_statut is null or paiement_statut in ('a_payer', 'paye'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'compta_lignes_moyen_paiement_chk') then
    alter table compta_lignes add constraint compta_lignes_moyen_paiement_chk
      check (moyen_paiement is null or moyen_paiement in
        ('virement', 'cheque', 'cb', 'especes', 'prelevement', 'autre'));
  end if;
end $$;
