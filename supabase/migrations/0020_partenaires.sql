-- Comptes partenaires : un partenaire externe (ex: Nico Traiteur) se
-- connecte désormais avec un seul code PIN qui donne accès à tous SES
-- avantages (comme le bureau voit tous les avantages internes), et peut
-- créer ses propres avantages depuis /partenaire, en plus du back-office.
-- Remplace l'ancien modèle où le PIN était rattaché à un avantage précis.

create table if not exists partenaires (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  pin_code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_partenaires_pin on partenaires(pin_code);

alter table avantages add column if not exists partenaire_id uuid references partenaires(id) on delete cascade;

-- Reprend les partenaires déjà créés sous l'ancien modèle (un par PIN
-- existant), pour que leur code continue de fonctionner sans rien
-- redistribuer.
insert into partenaires (nom, pin_code, active)
select distinct on (pin_code) coalesce(nullif(partner_name, ''), 'Partenaire'), pin_code, true
from avantages
where type = 'partenaire' and pin_code is not null;

update avantages a
set partenaire_id = p.id
from partenaires p
where a.type = 'partenaire' and a.pin_code = p.pin_code;

drop index if exists idx_avantages_pin;
alter table avantages drop column if exists pin_code;
alter table avantages drop column if exists partner_name;

alter table partenaires enable row level security;
-- Pas de policy publique : la gestion passe par le back-office (permission
-- "avantages") et l'espace partenaire (code PIN), tous deux avec la clé de
-- service.
