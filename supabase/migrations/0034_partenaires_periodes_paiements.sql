-- ÉCHAFAUDAGE — espace partenaires. Numéro provisoire, À RENUMÉROTER.
--
-- Période d'adhésion d'un partenaire + historique de ses paiements, saisis
-- MANUELLEMENT par le bureau (les partenaires paient par virement, il n'y a
-- pas de paiement en ligne pour l'instant). Le partenaire les voit en
-- LECTURE SEULE dans son espace.

-- 1. Périodes d'adhésion / de partenariat ---------------------------------
-- Un partenaire peut avoir plusieurs périodes au fil des ans. Il est
-- considéré "à jour" si la date du jour tombe dans une période dont
-- `annulee` est faux.
create table if not exists partenaire_periodes (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references partenaires(id) on delete cascade,
  debut date not null,
  fin date not null,
  niveau text,                          -- ex : "Gold" / "Silver" / "Bronze" (facultatif, écho des paliers de la page publique)
  montant_annonce_cents integer,        -- montant de partenariat annoncé pour la période (facultatif)
  note text,
  annulee boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references parents(id) on delete set null,
  check (fin >= debut)
);

create index if not exists idx_partenaire_periodes_partenaire
  on partenaire_periodes(partenaire_id);

alter table partenaire_periodes enable row level security;
-- Aucune policy publique : lecture partenaire via route serveur authentifiée,
-- écriture bureau via route serveur (permission "avantages").

-- 2. Paiements reçus (saisie manuelle bureau) -----------------------------
create table if not exists partenaire_paiements (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references partenaires(id) on delete cascade,
  periode_id uuid references partenaire_periodes(id) on delete set null,  -- rattachement facultatif à une période
  montant_cents integer not null check (montant_cents > 0),
  recu_le date not null,                -- date à laquelle le virement a été constaté
  moyen text not null default 'virement'
    check (moyen in ('virement', 'cheque', 'especes', 'autre')),
  reference text,                       -- référence du virement / n° de chèque
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references parents(id) on delete set null
);

create index if not exists idx_partenaire_paiements_partenaire
  on partenaire_paiements(partenaire_id);

alter table partenaire_paiements enable row level security;
-- Aucune policy publique (idem ci-dessus).
