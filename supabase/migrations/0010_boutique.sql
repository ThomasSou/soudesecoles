-- Boutique en ligne (précommandes, billetterie...) réglée via HelloAsso
-- Checkout, ouverte à tout visiteur (pas seulement aux familles adhérentes).

create table if not exists shop_products (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  image_url text,
  category text,               -- ex: "Foire 2026"
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table shop_products enable row level security;
-- Pas de policy publique : la lecture publique passe par une route API
-- côté serveur (clé secrète), comme le reste du back-office.

create table if not exists shop_orders (
  id uuid primary key default gen_random_uuid(),
  items jsonb not null,                 -- [{productId,name,unitPriceCents,qty}]
  total_cents integer not null check (total_cents >= 0),
  buyer_first_name text not null,
  buyer_last_name text not null,
  buyer_email text not null,
  parent_id uuid references parents(id) on delete set null,
  family_id uuid references families(id) on delete set null,
  checkout_intent_id text,
  helloasso_order_id text,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_shop_orders_checkout_intent on shop_orders(checkout_intent_id);
create index if not exists idx_shop_orders_family on shop_orders(family_id);

alter table shop_orders enable row level security;
-- Idem : aucune policy publique, tout passe par les routes API serveur.

insert into storage.buckets (id, name, public)
values ('shop-images', 'shop-images', true)
on conflict (id) do nothing;
