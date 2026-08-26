-- Rattache (facultativement) une inscription bénévole au compte connecté,
-- pour que la famille retrouve l'historique de son aide dans son espace, et
-- que le bureau puisse le voir aussi côté back-office. Reste entièrement
-- facultatif : l'inscription sans compte continue de fonctionner.

alter table benevolat_inscriptions add column if not exists parent_id uuid references parents(id) on delete set null;
alter table benevolat_inscriptions add column if not exists family_id uuid references families(id) on delete set null;

create index if not exists idx_benevolat_inscriptions_parent
  on benevolat_inscriptions(parent_id);
