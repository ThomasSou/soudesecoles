-- Historique des achats (billetterie, ventes, participations aux manifestations)
-- et messages envoyés depuis le formulaire de contact du site.

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  school_year text not null,
  label text not null,                 -- ex: "Loto 2026 - 6 cartons"
  event_name text,                     -- ex: "Loto", "Vide-greniers"
  quantity integer,
  amount numeric(10,2),
  payment_method text                  -- helloasso, sumup, especes, cheque
    check (payment_method in ('helloasso', 'sumup', 'especes', 'cheque') or payment_method is null),
  external_id text,                    -- id HelloAsso / SumUp si dispo
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_purchases_family on purchases(family_id);
create index if not exists idx_purchases_year on purchases(school_year);

alter table purchases enable row level security;

-- Chaque famille ne voit que ses propres achats.
drop policy if exists "parent lit les achats de sa famille" on purchases;
create policy "parent lit les achats de sa famille" on purchases
  for select using (family_id = public.my_family_id());

-- Messages du formulaire de contact.
-- Insertion ouverte à tous (formulaire public), lecture réservée à
-- l'administration (via la clé secrète côté serveur, qui contourne RLS).
create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

alter table contact_messages enable row level security;

drop policy if exists "tout le monde peut envoyer un message" on contact_messages;
create policy "tout le monde peut envoyer un message" on contact_messages
  for insert with check (true);
