-- ============================================================================
-- COMPTABILITÉ — une opération bancaire répartie sur PLUSIEURS lignes de
-- compta (virement global HelloAsso à ventiler par manifestation, dépense
-- partagée entre une manifestation et le fonctionnement...).
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un `select` indépendant — le message
-- « Success » de l'éditeur peut être périmé. Idempotente.
--
-- Jusqu'ici une opération ne pouvait être pointée qu'avec UNE ligne
-- (compta_operations.ligne_id). La table de liaison la remplace :
--   - une opération est « pointée » quand la somme de ses lignes liées égale
--     son montant ; tant qu'il reste une part à répartir, elle reste « à pointer » ;
--   - une ligne de compta ne peut être liée qu'à UNE opération.
-- La colonne compta_operations.ligne_id n'est plus utilisée ; elle est laissée
-- en place (rien n'est supprimé). Les pointages déjà faits sont recopiés.
--
-- RLS activé, AUCUNE policy publique : tout passe par les routes serveur.
-- ============================================================================

create table if not exists compta_operation_lignes (
  operation_id uuid not null references compta_operations(id) on delete cascade,
  ligne_id uuid not null references compta_lignes(id) on delete cascade,
  montant_cents integer not null check (montant_cents > 0),
  primary key (operation_id, ligne_id)
);

create unique index if not exists compta_operation_lignes_ligne_key
  on compta_operation_lignes (ligne_id);

alter table compta_operation_lignes enable row level security;
-- Pas de policy publique : lecture et écriture par les routes serveur.

-- Reprise des pointages existants (1 opération = 1 ligne).
insert into compta_operation_lignes (operation_id, ligne_id, montant_cents)
select o.id, o.ligne_id, l.montant_cents
from compta_operations o
join compta_lignes l on l.id = o.ligne_id
where o.ligne_id is not null
on conflict do nothing;

-- Vérif après commit :
-- select (select count(*) from compta_operation_lignes) as liens,
--        (select count(*) from compta_operations where ligne_id is not null) as anciens_pointages;
--   attendu : les deux nombres identiques

rollback;  -- <<< remplacer par "commit;" après relecture
