-- ============================================================================
-- STOCK DU LOCAL — articles, inventaires, achats ; calcul de la consommation.
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un `select` indépendant — le message
-- « Success » de l'éditeur peut être périmé. Idempotente.
--
-- Principe : après chaque manifestation et avant la suivante, le bureau compte
-- ce qu'il y a au local (boissons avec date de péremption, mais aussi stylos,
-- sacs poubelles, gobelets, barquettes…). Entre deux inventaires on note ce
-- qui est acheté. Consommation d'un article entre deux inventaires =
--     quantité au 1er inventaire + achats faits entre les deux − quantité au 2e.
--
--   stock_articles          le catalogue (nom, catégorie, unité, seuil d'alerte)
--                           et les « alias » : les façons de nommer l'article
--                           déjà rencontrées, pour reconnaître une dictée.
--   stock_inventaires       un comptage daté (souvent rattaché à une manifestation)
--   stock_inventaire_lignes une ligne par article compté ; un même article peut
--                           avoir plusieurs lignes (lots à dates de péremption
--                           différentes)
--   stock_achats            ce qui est acheté : quantité, date, lien facultatif
--                           vers la ligne de la comptabilité (facture)
--
-- RLS activé, AUCUNE policy publique : tout passe par les routes serveur.
-- ============================================================================

begin;

create table if not exists stock_articles (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  categorie text,
  unite text not null default 'unité',
  alias text[] not null default '{}',
  seuil_alerte numeric check (seuil_alerte is null or seuil_alerte >= 0),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists stock_articles_nom_key on stock_articles (lower(nom));

create table if not exists stock_inventaires (
  id uuid primary key default gen_random_uuid(),
  date_inventaire date not null,
  libelle text,                                    -- ex. « Après la Foire 2026 »
  evenement_id uuid references benevolat_evenements(id) on delete set null,
  note text,
  created_by uuid references parents(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_stock_inventaires_date on stock_inventaires (date_inventaire);

create table if not exists stock_inventaire_lignes (
  id uuid primary key default gen_random_uuid(),
  inventaire_id uuid not null references stock_inventaires(id) on delete cascade,
  article_id uuid not null references stock_articles(id) on delete restrict,
  quantite numeric not null check (quantite >= 0),
  date_peremption date,
  created_at timestamptz not null default now()
);
create index if not exists idx_stock_lignes_inventaire on stock_inventaire_lignes (inventaire_id);
create index if not exists idx_stock_lignes_article on stock_inventaire_lignes (article_id);

create table if not exists stock_achats (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references stock_articles(id) on delete restrict,
  quantite numeric not null check (quantite > 0),
  date_achat date not null,
  fournisseur text,
  ligne_compta_id uuid references compta_lignes(id) on delete set null,
  note text,
  created_by uuid references parents(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_stock_achats_article on stock_achats (article_id, date_achat);

alter table stock_articles enable row level security;
alter table stock_inventaires enable row level security;
alter table stock_inventaire_lignes enable row level security;
alter table stock_achats enable row level security;

-- Droit « stock » donné d'office à ceux qui ont déjà « comptabilite » ou « acces ».
update parents
set permissions = coalesce(permissions, '{}'::jsonb) || '{"stock": true}'::jsonb
where is_admin = true
  and (coalesce((permissions->>'comptabilite')::boolean, false) = true
       or coalesce((permissions->>'acces')::boolean, false) = true);

-- Vérif après commit :
-- select (select count(*) from information_schema.tables
--          where table_name in ('stock_articles','stock_inventaires','stock_inventaire_lignes','stock_achats')) as tables,
--        (select count(*) from parents where (permissions->>'stock')::boolean) as avec_droit_stock;
--   attendu : tables = 4 ; avec_droit_stock >= 1

rollback;  -- <<< remplacer par "commit;" après relecture
