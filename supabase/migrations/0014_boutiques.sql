-- Plusieurs boutiques distinctes (Foire, Marché de Noël - exposants, Marché
-- de Noël - précommandes...) au lieu d'un catalogue unique. La page publique
-- /boutique affiche un onglet par boutique ouverte. Une boutique peut avoir
-- une date de fermeture des commandes, après laquelle elle disparaît du
-- catalogue public (mais reste consultable en back-office).

create table if not exists boutiques (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  description text,
  active boolean not null default true,
  date_fermeture timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table boutiques enable row level security;
-- Pas de policy publique : lecture publique via route API serveur, comme
-- shop_products.

alter table shop_products
  add column if not exists boutique_id uuid references boutiques(id) on delete set null;

create index if not exists idx_shop_products_boutique on shop_products(boutique_id);

-- Les produits déjà en boutique (catalogue Foire actuel) sont rattachés à
-- une première boutique créée automatiquement, pour ne rien casser :
-- Thomas pourra la renommer et en créer d'autres depuis le back-office.
insert into boutiques (name, slug, position)
values ('Foire de Montmerle 2026', 'foire-de-montmerle-2026', 0)
on conflict (slug) do nothing;

update shop_products
set boutique_id = (select id from boutiques where slug = 'foire-de-montmerle-2026')
where boutique_id is null;
