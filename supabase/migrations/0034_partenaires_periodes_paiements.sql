-- ÉCHAFAUDAGE — espace partenaires. Numéro provisoire, À RENUMÉROTER.
--
-- Niveaux de partenariat (Or / Argent / Bronze) + période d'adhésion d'un
-- partenaire + historique de ses paiements, saisis MANUELLEMENT par le
-- bureau (les partenaires paient par virement, il n'y a pas de paiement en
-- ligne pour l'instant). Le partenaire voit période et paiements en
-- LECTURE SEULE dans son espace.

-- 1. Niveaux de partenariat (liste fermée, configurée par le bureau) -----
-- Le niveau est porté par la PÉRIODE (cf. partenaire_periodes.niveau) et y
-- est figé : pas de changement de niveau en cours de période. Le bureau
-- règle ici, pour chaque niveau, les contreparties et les quotas de
-- messages "nouveautés" (cf. 0038_partenaire_messages.sql).
create table if not exists niveaux_partenaire (
  niveau text primary key check (niveau in ('or', 'argent', 'bronze')),
  libelle text not null,
  ordre integer not null,               -- 1 = Or, 2 = Argent, 3 = Bronze (ordre d'affichage / de passage dans l'e-mailing)
  quota_email integer not null default 0,      -- messages "nouveautés" par mois, type e-mail
  quota_reseau integer not null default 0,     -- idem, type réseaux sociaux (prévu, pas encore d'écran)
  quota_avantages integer,              -- nombre max d'avantages actifs (null = illimité)
  contreparties text,                   -- texte libre : ce que le niveau donne droit
  updated_at timestamptz not null default now(),
  updated_by uuid references parents(id) on delete set null
);

insert into niveaux_partenaire (niveau, libelle, ordre, quota_email, quota_reseau, quota_avantages)
values
  ('or',     'Or',     1, 3, 3, null),
  ('argent', 'Argent', 2, 1, 1, 5),
  ('bronze', 'Bronze', 3, 0, 0, 2)
on conflict (niveau) do nothing;

alter table niveaux_partenaire enable row level security;
-- Aucune policy publique : lecture/écriture via routes serveur (permission
-- "avantages" en attendant "partenaires").

-- 2. Périodes d'adhésion / de partenariat -------------------------------
-- Dates 100 % libres (aucun calage sur l'année scolaire). Un partenaire est
-- "à jour" si la date du jour tombe dans une période non annulée.
create table if not exists partenaire_periodes (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references partenaires(id) on delete cascade,
  debut date not null,
  fin date not null,
  niveau text references niveaux_partenaire(niveau) on update cascade,  -- figé pour la période
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
-- Aucune policy publique.

-- 3. Paiements reçus (saisie manuelle bureau) --------------------------
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
create index if not exists idx_partenaire_paiements_periode
  on partenaire_paiements(periode_id);

alter table partenaire_paiements enable row level security;
-- Aucune policy publique. La suppression d'une période est refusée côté
-- route si un paiement lui est rattaché (cf.
-- app/api/admin/partenaires/[id]/periodes/[periodeId]/route.js).
