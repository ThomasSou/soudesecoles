-- ============================================================================
-- FACTURES ÉMISES PAR LE SOU — partenariats (série PA) et ventes avec
-- contrepartie, ex. tables et emplacements du Marché de Noël (série MN).
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un `select` indépendant — le message
-- « Success » de l'éditeur peut être périmé. Idempotente.
--
-- Règles :
--   - Numéro chronologique CONTINU par série et par année : PA2026-001,
--     PA2026-002… Jamais de trou, jamais de réutilisation : une facture ne se
--     supprime pas, elle s'ANNULE (le numéro reste, marqué « annulée »).
--   - Association non assujettie à la TVA : un seul montant, sans TVA.
--   - Un DON ne se facture jamais : il relève d'un reçu fiscal (Cerfa
--     2041-MEC-SD). Une facture de partenariat peut seulement MENTIONNER
--     le don séparé (don_associe_cents), qui n'entre pas dans son montant.
--
-- Pièces déjà émises HORS du site, à reprendre pour que la suite continue
-- sans trou :
--   PA2026-001  Restaurant Emile Job, Pack Bronze 2025, 50 €,  émise le 10/11/2026, acquittée le 19/10/2026 par virement
--   PA2026-002  Restaurant Emile Job, Pack Argent 2026, 100 €, même règlement
--   MN2026-001  reçu du marché de Noël (non repris ici : seul son numéro compte)
-- => prochaine facture de partenariat : PA2026-003 ; prochaine pièce du marché
--    de Noël : MN2026-002.
--
-- RLS activé, AUCUNE policy publique : tout passe par les routes serveur.
-- ============================================================================

begin;

-- 1. Coordonnées de facturation d'un partenaire (préremplissent la facture) -----
alter table partenaires add column if not exists raison_sociale text;
alter table partenaires add column if not exists forme_juridique text;
alter table partenaires add column if not exists siren text;

-- 2. Séries de numérotation -------------------------------------------------------
create table if not exists facture_series (
  code text primary key,                 -- préfixe du numéro : 'PA', 'MN'…
  libelle text not null,
  ordre integer not null default 0
);
insert into facture_series (code, libelle, ordre) values
  ('PA', 'Partenariats', 1),
  ('MN', 'Marché de Noël (tables, emplacements)', 2)
on conflict (code) do nothing;
alter table facture_series enable row level security;

-- Dernier numéro déjà utilisé HORS du site, pour une série et une année : la
-- numérotation reprend juste après. (Le plus grand numéro enregistré dans le
-- site l'emporte s'il est supérieur.)
create table if not exists facture_numeros_hors_site (
  serie text not null references facture_series(code) on update cascade,
  annee integer not null,
  dernier_numero integer not null check (dernier_numero >= 0),
  primary key (serie, annee)
);
insert into facture_numeros_hors_site (serie, annee, dernier_numero) values
  ('MN', 2026, 1)                         -- reçu MN2026-001 émis hors site
on conflict (serie, annee) do nothing;
alter table facture_numeros_hors_site enable row level security;

-- 3. Les factures -------------------------------------------------------------
create table if not exists factures_emises (
  id uuid primary key default gen_random_uuid(),

  serie text not null references facture_series(code) on update cascade,
  annee integer not null,                -- année de la date de facture
  numero integer not null check (numero > 0),
  numero_complet text not null unique,   -- ex. PA2026-003
  type_piece text not null default 'facture' check (type_piece in ('facture', 'recu')),
  statut text not null default 'emise' check (statut in ('emise', 'annulee')),
  annulee_le timestamptz,

  date_facture date not null,

  -- Client (copié sur la facture : elle ne change plus si la fiche change).
  client_raison_sociale text not null,
  client_forme text,
  client_siren text,
  client_adresse text,
  client_code_postal text,
  client_ville text,

  objet text not null,
  montant_cents integer not null check (montant_cents > 0),

  -- « Acquittée le … par … »
  acquittee_le date not null,
  moyen_paiement text not null
    check (moyen_paiement in ('virement', 'cheque', 'cb', 'especes', 'prelevement', 'autre')),
  paiement_reference text,

  -- Don séparé, couvert par un Cerfa 2041-MEC-SD : simple mention, hors montant.
  don_associe_cents integer check (don_associe_cents is null or don_associe_cents > 0),

  -- Rattachements
  partenaire_id uuid references partenaires(id) on delete set null,
  periode_id uuid references partenaire_periodes(id) on delete set null,
  partenaire_paiement_id uuid references partenaire_paiements(id) on delete set null,
  recette_ligne_id uuid references compta_lignes(id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid references parents(id) on delete set null,

  unique (serie, annee, numero)
);

create index if not exists idx_factures_emises_partenaire on factures_emises (partenaire_id);
create index if not exists idx_factures_emises_recette on factures_emises (recette_ligne_id);
alter table factures_emises enable row level security;

-- 4. Les deux factures de partenariat déjà émises (données des PDF d'origine) ----------
-- Émises le 10/11/2026 ; acquittées le 19/10/2026 par DEUX virements (300 € et
-- 600 €, soit 900 € au total) qui comprennent aussi le don de 750 € (couvert par
-- un reçu fiscal Cerfa 2041-MEC-SD séparé, donc simplement mentionné).
-- Le partenaire est retrouvé par son nom s'il existe déjà dans le back-office ;
-- sinon il reste vide et se rattache ensuite depuis l'écran des factures.
insert into factures_emises
  (serie, annee, numero, numero_complet, date_facture,
   client_raison_sociale, client_forme, client_siren,
   client_adresse, client_code_postal, client_ville,
   objet, montant_cents, acquittee_le, moyen_paiement, paiement_reference,
   don_associe_cents, partenaire_id)
select 'PA', 2026, 1, 'PA2026-001', date '2026-11-10',
       'RESTAURANT EMILE JOB', 'SAS', '334139326',
       '12 rue du Pont', '01090', 'Montmerle-sur-Saône',
       'Adhésion partenaire Pack Bronze — année 2025 du Sou des Écoles',
       5000, date '2026-10-19', 'virement',
       'deux virements de 300,00 € et 600,00 € (900,00 € au total, don compris)',
       75000,
       (select id from partenaires where nom ilike 'emile job%' order by created_at limit 1)
where not exists (select 1 from factures_emises where numero_complet = 'PA2026-001');

insert into factures_emises
  (serie, annee, numero, numero_complet, date_facture,
   client_raison_sociale, client_forme, client_siren,
   client_adresse, client_code_postal, client_ville,
   objet, montant_cents, acquittee_le, moyen_paiement, paiement_reference,
   don_associe_cents, partenaire_id)
select 'PA', 2026, 2, 'PA2026-002', date '2026-11-10',
       'RESTAURANT EMILE JOB', 'SAS', '334139326',
       '12 rue du Pont', '01090', 'Montmerle-sur-Saône',
       'Adhésion partenaire Pack Argent — année 2026 du Sou des Écoles : logo format moyen sur tous les supports (roll-up, banderole, affiches), page partenaire sur sou-montmerle.fr, logo sur Facebook, Instagram et en pied des mails, table partenaires lors des manifestations, espace partenaire et 1 mail dédié par an.',
       10000, date '2026-10-19', 'virement',
       'deux virements de 300,00 € et 600,00 € (900,00 € au total, don compris)',
       75000,
       (select id from partenaires where nom ilike 'emile job%' order by created_at limit 1)
where not exists (select 1 from factures_emises where numero_complet = 'PA2026-002');

-- Si la fiche du partenaire existe, on y renseigne les coordonnées de facturation
-- (seulement les champs encore vides).
update partenaires
   set raison_sociale = coalesce(raison_sociale, 'RESTAURANT EMILE JOB'),
       forme_juridique = coalesce(forme_juridique, 'SAS'),
       siren = coalesce(siren, '334139326')
 where nom ilike 'emile job%';

-- Vérif après commit :
-- select numero_complet, client_raison_sociale, client_siren, montant_cents, don_associe_cents,
--        date_facture, acquittee_le, partenaire_id is not null as rattachee
--   from factures_emises order by numero_complet;
--   attendu : PA2026-001 (5000) et PA2026-002 (10000), SIREN 334139326, don 75000
-- select * from facture_numeros_hors_site;
--   attendu : MN / 2026 / 1

rollback;  -- <<< remplacer par "commit;" après relecture
