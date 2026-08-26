-- Un avantage pouvait jusqu'ici être utilisé une seule fois par famille
-- (contrainte unique). Certains avantages doivent pouvoir être utilisés
-- plusieurs fois (ex. 2 boissons offertes) : on remplace la contrainte
-- unique par une limite configurable, vérifiée côté application.

alter table avantages add column if not exists limite integer not null default 1 check (limite >= 1);

alter table avantage_utilisations drop constraint if exists avantage_utilisations_avantage_id_family_id_key;

create index if not exists idx_avantage_utilisations_avantage_famille
  on avantage_utilisations(avantage_id, family_id);
