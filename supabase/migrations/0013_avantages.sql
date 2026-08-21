-- Avantages à usage limité (une fois par famille) : boisson offerte aux
-- adhérents lors des manifestations, offres partenaires "une fois par
-- client". S'appuie sur le QR code d'adhésion déjà existant
-- (memberships.qr_code_token) : scanner la carte ouvre toujours
-- /verifier-adhesion/[token], qui affiche en plus un bouton de validation
-- si la personne qui scanne est autorisée (bureau connecté, ou partenaire
-- muni du bon code PIN).

create table if not exists avantages (
  id uuid primary key default gen_random_uuid(),
  label text not null,                 -- ex: "Boisson offerte - Foire 2026"
  type text not null default 'interne'
    check (type in ('interne', 'partenaire')),
  partner_name text,                   -- nom du partenaire si type = 'partenaire'
  pin_code text,                       -- code à 4 chiffres donné au partenaire
  requiert_adhesion boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_avantages_pin on avantages(pin_code)
  where pin_code is not null;

create table if not exists avantage_utilisations (
  id uuid primary key default gen_random_uuid(),
  avantage_id uuid not null references avantages(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  used_at timestamptz not null default now(),
  used_by text,                        -- nom du bénévole ou du partenaire
  unique (avantage_id, family_id)      -- empêche la double utilisation
);

create index if not exists idx_avantage_utilisations_avantage
  on avantage_utilisations(avantage_id);

alter table avantages enable row level security;
alter table avantage_utilisations enable row level security;
-- Pas de policy publique : la gestion passe par le back-office (permission
-- "avantages") et la validation par les routes API dédiées (back-office ou
-- code PIN partenaire), toutes deux avec la clé de service.
