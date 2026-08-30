-- ESPACE PARTENAIRES — NON APPLIQUÉ (à relire avant application).
-- Migration 0035 de la série d'intégration des 4 chantiers. Ordre : après
-- 0034_espace_enseignants.sql, avant 0036..0039 (partenaires) puis
-- 0040_contact_messages_origine.sql. À exécuter à la main dans l'éditeur SQL
-- Supabase, puis vérifier par un `select` indépendant.
--
-- Objet de ce fichier : donner aux partenaires un VRAI compte de connexion
-- (e-mail + mot de passe, même circuit d'invitation que les familles) et
-- des coordonnées complètes, sans casser le fonctionnement actuel.
--
-- Ce qui NE change PAS :
--   - `partenaires.pin_code` reste en place : il sert toujours à valider un
--     avantage au comptoir depuis /verifier-adhesion/[token] (le vendeur
--     saisit le PIN, il ne se connecte pas). Le compte e-mail/mot de passe
--     ajouté ici sert uniquement à l'ESPACE PARTENAIRE (paiements, période,
--     avantages, documents, contact).
--   - Les avantages et leur consommation (`avantages`,
--     `avantage_utilisations`) : voir 0035.

-- 1. Coordonnées et compte de connexion du partenaire ------------------------

alter table partenaires add column if not exists email text;
alter table partenaires add column if not exists contact_nom text;      -- personne référente
alter table partenaires add column if not exists telephone text;
alter table partenaires add column if not exists adresse text;
alter table partenaires add column if not exists code_postal text;
alter table partenaires add column if not exists ville text;
alter table partenaires add column if not exists site_web text;
alter table partenaires add column if not exists notes text;            -- notes internes bureau (jamais affichées au partenaire)
alter table partenaires add column if not exists slug text;             -- rapprochement futur avec la page publique /partenaires
alter table partenaires add column if not exists auth_user_id uuid;
alter table partenaires add column if not exists created_by uuid references parents(id) on delete set null;
alter table partenaires add column if not exists updated_at timestamptz not null default now();

-- Un e-mail peut être absent au départ (partenaire créé avant d'avoir son
-- contact), mais s'il est présent il doit être unique : c'est lui qui sert à
-- inviter, comme pour les parents (cf. parents_email_key en 0025).
create unique index if not exists partenaires_email_key
  on partenaires (lower(email)) where email is not null and email <> '';

-- Lien vers le compte auth.users (nul tant que l'invitation n'a pas été
-- envoyée / le compte pas créé). Unique : un compte = un partenaire.
alter table partenaires
  drop constraint if exists partenaires_auth_user_id_fkey;
alter table partenaires
  add constraint partenaires_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete set null;

create unique index if not exists partenaires_auth_user_id_key
  on partenaires (auth_user_id) where auth_user_id is not null;

-- `pin_code` devient facultatif : un partenaire "espace only" (qui ne valide
-- jamais d'avantage au comptoir) n'a pas besoin de PIN. Le back-office
-- continue d'en générer un par défaut à la création.
alter table partenaires alter column pin_code drop not null;

-- RLS : déjà activé en 0020, toujours aucune policy publique. Tout passe par
-- les routes serveur (clé de service) : back-office avec la permission
-- "avantages" (à scinder plus tard en "partenaires", cf. doc), espace
-- partenaire authentifié via le jeton Supabase du compte.

-- 2. Invitations : rattachement à un partenaire ----------------------------

-- La table `invitations` (0015 / 0021) portait uniquement `parent_id`. On
-- ajoute `partenaire_id` pour réutiliser EXACTEMENT le même circuit maison
-- (jeton à usage unique + /activer-compte + /api/activer-compte). La route
-- d'activation ne lit que `user_id` : elle fonctionne déjà pour les deux.
alter table invitations add column if not exists partenaire_id uuid
  references partenaires(id) on delete set null;

create index if not exists idx_invitations_partenaire on invitations(partenaire_id);
