-- Petit résumé de l'événement (contexte, dates...), affiché en haut de la
-- page publique /benevoles pour que les visiteurs sachent de quoi il s'agit
-- avant de choisir un créneau.
alter table benevolat_evenements add column if not exists description text;
