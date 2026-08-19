-- Demandes d'inscription (formulaire public, soumis a moderation).
-- Le parcours normal reste : import admin des familles (script
-- scripts/import-familles.mjs) qui invite directement les parents par email.
-- Ce formulaire couvre les cas hors import (nouvelle famille en cours
-- d'annee, oubli lors de l'import, etc.) : la demande est stockee ici et
-- traitee manuellement par le bureau (validation -> creation du compte via
-- le meme mecanisme d'invitation que l'import).

create table if not exists registration_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  children jsonb not null default '[]'::jsonb,
  message text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table registration_requests enable row level security;

create policy "public peut soumettre une demande d'inscription" on registration_requests
  for insert
  to anon, authenticated
  with check (true);

-- Pas de policy de lecture : la consultation des demandes se fait pour
-- l'instant via le Table Editor Supabase (compte bureau), en attendant le
-- back-office admin de la Phase 2.
