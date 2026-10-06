-- ============================================================================
-- BOUTIQUE — quantité limite par produit et personnalisations (taille,
-- couleur, texte...) avec supplément de prix éventuel.
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : RELIRE puis remplacer "rollback" par "commit".
--
--   max_quantity : nombre total d'exemplaires vendables (NULL = illimité).
--   options      : définitions des personnalisations, tableau JSON, par ex.
--     [{"id":"o1","label":"Taille","type":"choix","required":true,
--       "choices":[{"label":"S","extraCents":0},{"label":"XL","extraCents":200}]},
--      {"id":"o2","label":"Texte à broder","type":"texte","required":false,
--       "extraCents":300}]
--
-- Les commandes (shop_orders.items, déjà en JSON) portent les choix faits :
-- aucune autre table à modifier.
-- ============================================================================
begin;

alter table shop_products
  add column if not exists max_quantity integer
    check (max_quantity is null or max_quantity >= 0);

alter table shop_products
  add column if not exists options jsonb not null default '[]'::jsonb;

-- Vérif après commit :
-- select column_name, data_type from information_schema.columns
--  where table_name = 'shop_products' and column_name in ('max_quantity','options');
--   attendu : 2 lignes

rollback;  -- <<< remplacer par "commit;" après relecture
