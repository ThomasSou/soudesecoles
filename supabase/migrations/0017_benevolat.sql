-- Créneaux bénévoles : les bénévoles s'inscrivent (sans compte) sur des
-- créneaux horaires rattachés à un atelier/poste (Buvette, Entrée...),
-- lui-même rattaché à un événement (Foire 2026...). Chaque atelier a ses
-- propres créneaux (horaires et places différents), qui peuvent se
-- chevaucher entre ateliers puisque les besoins sont simultanés.

create table if not exists benevolat_evenements (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists benevolat_ateliers (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references benevolat_evenements(id) on delete cascade,
  nom text not null,
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_benevolat_ateliers_evenement
  on benevolat_ateliers(evenement_id);

create table if not exists benevolat_creneaux (
  id uuid primary key default gen_random_uuid(),
  atelier_id uuid not null references benevolat_ateliers(id) on delete cascade,
  debut timestamptz not null,
  fin timestamptz not null,
  places integer not null check (places > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_benevolat_creneaux_atelier
  on benevolat_creneaux(atelier_id);

create table if not exists benevolat_inscriptions (
  id uuid primary key default gen_random_uuid(),
  creneau_id uuid not null references benevolat_creneaux(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default now(),
  unique (creneau_id, email)
);

create index if not exists idx_benevolat_inscriptions_creneau
  on benevolat_inscriptions(creneau_id);

alter table benevolat_evenements enable row level security;
alter table benevolat_ateliers enable row level security;
alter table benevolat_creneaux enable row level security;
alter table benevolat_inscriptions enable row level security;
-- Pas de policy publique : lecture du planning et inscription passent par
-- des routes API serveur, comme la boutique.
