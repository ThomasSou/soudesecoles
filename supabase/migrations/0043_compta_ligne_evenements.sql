-- ============================================================================
-- COMPTABILITÉ — une ligne peut concerner PLUSIEURS manifestations.
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un select indépendant.
--
-- Jusqu'ici une ligne « événement » pointait UNE manifestation
-- (compta_lignes.evenement_id). Le bureau a parfois une dépense à répartir
-- à parts égales sur deux manifestations (ex. une commande commune Foire +
-- Vide-greniers). On ajoute donc une table de liaison, sur le même modèle
-- que compta_ligne_classes.
--
-- compta_lignes.evenement_id est conservé : il continue de porter la
-- PREMIÈRE manifestation de la ligne (la contrainte
-- compta_lignes_evenement_coherent reste valable, aucune migration de
-- contrainte). La liste complète vit dans compta_ligne_evenements.
--
-- RLS activé, aucune policy : accès via /api/admin/comptabilite/* seulement.
-- ============================================================================

create table if not exists compta_ligne_evenements (
  ligne_id uuid not null references compta_lignes(id) on delete cascade,
  evenement_id uuid not null references benevolat_evenements(id) on delete cascade,
  primary key (ligne_id, evenement_id)
);

alter table compta_ligne_evenements enable row level security;

-- Reprise des lignes existantes (mono-manifestation).
insert into compta_ligne_evenements (ligne_id, evenement_id)
select id, evenement_id
from compta_lignes
where rubrique = 'evenement' and evenement_id is not null
on conflict do nothing;
