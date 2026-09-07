-- ============================================================================
-- COMPTABILITÉ — répartition différenciée d'une ligne entre ses classes /
-- manifestations.
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un select indépendant. Idempotente.
--
-- Par défaut une ligne « classe » / « événement » se divise à parts égales
-- entre les classes / manifestations cochées. Parfois la répartition n'est
-- pas égale : on ajoute alors un montant par lien.
--   montant_cents NULL  -> mode égal (recalculé à la lecture)
--   montant_cents saisi -> mode différencié (la somme doit égaler le total
--                          de la ligne — vérifié côté application)
-- ============================================================================

alter table compta_ligne_classes add column if not exists montant_cents integer;
alter table compta_ligne_evenements add column if not exists montant_cents integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compta_ligne_classes_montant_chk') then
    alter table compta_ligne_classes
      add constraint compta_ligne_classes_montant_chk
      check (montant_cents is null or montant_cents >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'compta_ligne_evenements_montant_chk') then
    alter table compta_ligne_evenements
      add constraint compta_ligne_evenements_montant_chk
      check (montant_cents is null or montant_cents >= 0);
  end if;
end $$;
