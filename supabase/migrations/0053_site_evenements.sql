-- ============================================================================
-- ÉVÉNEMENTS DU SITE — le calendrier public (accueil + page Événements) devient
-- modifiable depuis le back-office au lieu d'être figé dans le code.
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : RELIRE puis remplacer "rollback" par "commit".
--
-- Reprend les 6 manifestations de la saison 2026-2027 (app/evenements/data.js).
-- Tant que cette migration n'est pas passée, le site continue d'afficher la
-- liste du code. Distinct de benevolat_evenements (manifestations des
-- bénévoles et de la compta), qui n'est pas modifiée.
--
-- Donne aussi le nouveau droit « evenements » aux membres du bureau qui ont
-- déjà le droit de gérer les accès.
-- ============================================================================
begin;

create table if not exists site_evenements (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  date_debut date not null,
  date_fin date check (date_fin is null or date_fin >= date_debut),
  lieu text,
  description text,
  image_url text,
  -- Seule la Foire a une page dédiée (/evenements/foire, écrite dans le code).
  page_dediee boolean not null default false,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

alter table site_evenements enable row level security;
-- Pas de policy publique : lecture et écriture par les routes serveur.

insert into site_evenements (slug, name, date_debut, date_fin, lieu, description, image_url, page_dediee)
values
  ('foire', 'Foire', '2026-09-04', '2026-09-05', 'Bords de Saône, Montmerle-sur-Saône',
   'Deux jours de fête : banquet gallo-romain, feu d''artifice, foire commerciale et spectacles équestres médiévaux.',
   '/evenements/foire.jpg', true),
  ('marche-de-noel', 'Marché de Noël', '2026-11-28', null, 'Place du marché',
   'Marché artisanal et animations pour les familles, de 10h30 à 20h30.', null, false),
  ('loto', 'Loto', '2027-01-31', null, 'Salle des fêtes',
   'Une après-midi conviviale et de nombreux lots à gagner, de 12h à 18h30.', null, false),
  ('vide-greniers', 'Vide-greniers', '2027-05-16', null, 'Site des Mûriers',
   'Brocante ouverte à tous, exposants et visiteurs, de 4h à 18h.', null, false),
  ('montmerle-part-en-live', 'Montmerle part en Live', '2027-06-06', null, 'Parc de la Batellerie',
   'Événement musical grand public : DJ sets, food et cocktails.', null, false),
  ('fete-de-l-ecole', 'Fête de l''école', '2027-06-25', null, 'Site des Mûriers',
   'La fête de fin d''année, moment fort pour les enfants, de 16h à 21h.', null, false)
on conflict (slug) do nothing;

-- Droit « evenements » pour les membres du bureau qui gèrent déjà les accès.
update parents
set permissions = coalesce(permissions, '{}'::jsonb) || '{"evenements": true}'::jsonb
where is_admin = true
  and coalesce((permissions->>'acces')::boolean, false) = true;

-- Vérif après commit :
-- select slug, name, date_debut from site_evenements order by date_debut;
--   attendu : 6 lignes

rollback;  -- <<< remplacer par "commit;" après relecture
