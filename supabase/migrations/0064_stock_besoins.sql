-- ============================================================================
-- STOCK — besoins par manifestation (=> liste de courses) + matériel durable.
-- NON exécutée automatiquement : à lancer à la main dans le SQL Editor
-- Supabase APRÈS 0063, puis vérifier par un `select` indépendant. Idempotente.
--
--   stock_besoins : pour une manifestation (texte libre, ex. « Marché de Noël
--   2026 »), la quantité nécessaire de chaque article. Courses à faire =
--   besoin − stock estimé (calculé par le site, jamais stocké).
--   stock_articles.durable : matériel qui ne se consomme pas (tables, barnums…),
--   compté mais exclu du calcul de consommation et de la liste de courses.
-- ============================================================================

begin;

alter table stock_articles add column if not exists durable boolean not null default false;
alter table stock_articles add column if not exists observation text;

create table if not exists stock_besoins (
  id uuid primary key default gen_random_uuid(),
  manifestation text not null,
  article_id uuid not null references stock_articles(id) on delete cascade,
  quantite numeric not null check (quantite >= 0),
  updated_at timestamptz not null default now(),
  unique (manifestation, article_id)
);
create index if not exists idx_stock_besoins_manif on stock_besoins (manifestation);
alter table stock_besoins enable row level security;

-- Vérif après commit :
-- select (select count(*) from information_schema.tables where table_name = 'stock_besoins') as table_besoins,
--        (select count(*) from information_schema.columns where table_name = 'stock_articles' and column_name in ('durable','observation')) as colonnes;
--   attendu : table_besoins = 1 ; colonnes = 2

rollback;  -- <<< remplacer par "commit;" après relecture
