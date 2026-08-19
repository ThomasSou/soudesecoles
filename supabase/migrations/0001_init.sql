-- Sou des Écoles Montmerle-Lurcy — schéma initial (Phase 1)
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > coller > Run

create extension if not exists "pgcrypto";

-- Une famille = une cotisation, quel que soit le nombre de parents/enfants
create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  address_line text,
  postal_code text,
  city text,
  status_current_year text not null default 'non_adherent'
    check (status_current_year in ('adherent', 'non_adherent', 'ancien_parent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un parent = un compte de connexion (lié à auth.users), rattaché à une famille
create table if not exists parents (
  id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid references families(id) on delete set null,
  first_name text,
  last_name text,
  email text,
  phone text,
  role text not null default 'parent'
    check (role in ('parent', 'admin_general', 'admin_commission')),
  created_at timestamptz not null default now()
);

-- Enfants rattachés à une famille, avec historique par année scolaire
create table if not exists children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  class_level text,
  school_year text not null,
  created_at timestamptz not null default now()
);

-- Adhésion / cotisation par famille et par année
create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  school_year text not null,
  amount numeric(10,2),
  paid_at timestamptz,
  helloasso_payment_id text,
  qr_code_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unique (family_id, school_year)
);

create index if not exists idx_parents_family on parents(family_id);
create index if not exists idx_children_family on children(family_id);
create index if not exists idx_memberships_family on memberships(family_id);
create index if not exists idx_memberships_qr on memberships(qr_code_token);

-- Row Level Security : chaque parent ne voit/modifie que les données de sa propre famille.
-- Les opérations d'administration (import, gestion globale) passent par la clé secrète
-- côté serveur, qui contourne RLS — pas besoin de policy "admin" ici pour la Phase 1.

alter table families enable row level security;
alter table parents enable row level security;
alter table children enable row level security;
alter table memberships enable row level security;

create policy "parent lit sa famille" on families
  for select using (
    id in (select family_id from parents where parents.id = auth.uid())
  );

create policy "parent lit son profil et celui de son conjoint" on parents
  for select using (
    family_id in (select family_id from parents where parents.id = auth.uid())
  );

create policy "parent modifie son propre profil" on parents
  for update using (id = auth.uid());

create policy "parent lit les enfants de sa famille" on children
  for select using (
    family_id in (select family_id from parents where parents.id = auth.uid())
  );

create policy "parent lit l'adhesion de sa famille" on memberships
  for select using (
    family_id in (select family_id from parents where parents.id = auth.uid())
  );
