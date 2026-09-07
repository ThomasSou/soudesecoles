-- ============================================================================
-- COMPTABILITÉ — liste de départ des manifestations.
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase. Idempotente (n'insère que les noms absents).
--
-- Les manifestations sont la table `benevolat_evenements` (partagée avec la
-- section Bénévoles). Le sélecteur de la compta les affiche toutes en
-- pastilles ; on peut toujours en ajouter depuis le formulaire.
--
-- Liste validée par Thomas (2026-2027) : Foire, Marché de Noël, Loto,
-- Tombola, Fête de l'école, Vide-greniers, Montmerle part en live.
-- Les noms ne portent PAS l'année (une manifestation est réutilisée d'une
-- année sur l'autre ; l'année scolaire est portée par compta_lignes).
-- ============================================================================

-- Retire l'année d'une éventuelle "Foire 20xx" déjà présente (issue de la
-- section Bénévoles), sauf si "Foire" existe déjà.
update benevolat_evenements
set nom = 'Foire'
where nom ~ '^Foire.*[0-9]{4}$'
  and not exists (select 1 from benevolat_evenements e2 where e2.nom = 'Foire');

insert into benevolat_evenements (nom, actif)
select v.nom, true
from (values
  ('Foire'),
  ('Marché de Noël'),
  ('Loto'),
  ('Tombola'),
  ('Fête de l''école'),
  ('Vide-greniers'),
  ('Montmerle part en live')
) as v(nom)
where not exists (
  select 1 from benevolat_evenements e where e.nom = v.nom
);
