-- ============================================================================
-- REMBOURSEMENTS BÉNÉVOLES ↔ COMPTABILITÉ
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un select indépendant. Idempotente.
--
-- 1. Les demandes de remboursement portent maintenant le prestataire
--    (émetteur de la facture) et se rattachent à une manifestation de la
--    liste partagée (benevolat_evenements), comme la compta.
-- 2. Chaque demande non refusée est recopiée en ligne de compta
--    (source = 'benevole', payé par le bénévole), avec le nouveau statut
--    'a_valider'. Circuit : à valider → à pointer (+ remboursé) → pointé.
-- ============================================================================

-- 1. Demandes de remboursement -----------------------------------------------
alter table reimbursement_requests add column if not exists supplier_name text;
alter table reimbursement_requests
  add column if not exists evenement_id uuid references benevolat_evenements(id) on delete set null;

-- 2. compta_lignes : statut 'a_valider', source 'benevole', lien vers la demande
alter table compta_lignes drop constraint if exists compta_lignes_statut_check;
alter table compta_lignes drop constraint if exists compta_lignes_source_check;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compta_lignes_statut_chk') then
    alter table compta_lignes add constraint compta_lignes_statut_chk
      check (statut in ('prevu', 'a_verifier', 'pointe', 'a_valider'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'compta_lignes_source_chk') then
    alter table compta_lignes add constraint compta_lignes_source_chk
      check (source in ('manuel', 'enseignant', 'import', 'benevole'));
  end if;
end $$;

alter table compta_lignes
  add column if not exists reimbursement_request_id uuid
  references reimbursement_requests(id) on delete set null;

-- Une demande n'est recopiée qu'une seule fois.
create unique index if not exists compta_lignes_reimbursement_key
  on compta_lignes (reimbursement_request_id)
  where reimbursement_request_id is not null;
