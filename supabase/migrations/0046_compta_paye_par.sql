-- ============================================================================
-- COMPTABILITÉ — qui a payé la dépense : le Sou, ou un bénévole (avance de
-- frais).
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase. Idempotente.
--
--   paye_par NULL ou 'sou'  -> réglé directement par l'association
--   paye_par = 'benevole'   -> avancé par un bénévole (paye_par_parent_id),
--                              à rembourser
-- ============================================================================

alter table compta_lignes add column if not exists paye_par text;
alter table compta_lignes
  add column if not exists paye_par_parent_id uuid references parents(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compta_lignes_paye_par_chk') then
    alter table compta_lignes
      add constraint compta_lignes_paye_par_chk
      check (paye_par is null or paye_par in ('sou', 'benevole'));
  end if;
end $$;
