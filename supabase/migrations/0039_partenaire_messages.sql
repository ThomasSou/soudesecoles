-- ESPACE PARTENAIRES — NON APPLIQUÉ. Série d'intégration des 4 chantiers.
--
-- Messages "nouveautés" proposés par les partenaires. Un partenaire rédige
-- un message (titre, texte, 1 image, 1 lien), le soumet, le bureau valide ou
-- refuse (avec motif). Les messages 'valide' d'un mois alimenteront ensuite
-- un e-mailing mensuel « Les nouveautés de nos partenaires » — CHANTIER DE
-- SUITE non codé ici (cf. docs/conception-espace-partenaires.md §8). Le
-- schéma prévoit déjà ce qu'il faut pour ne pas re-migrer : `mois_cible`,
-- statut 'publie', `publie_le`.
--
-- Deux types :
--   - 'email'  : construit maintenant (écran partenaire + écran bureau).
--   - 'reseau' : prévu dans le modèle (quota distinct), PAS d'écran de
--                rédaction/publication pour l'instant.
--
-- Le quota applicable à un partenaire = celui du NIVEAU de sa période active
-- (cf. niveaux_partenaire.quota_email / quota_reseau, migration 0034).

create table if not exists partenaire_messages (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references partenaires(id) on delete cascade,
  type text not null check (type in ('email', 'reseau')),
  titre text not null,
  texte text not null,
  image_chemin text,                    -- 1 image, bucket privé "partenaire-messages"
  lien text,                            -- URL libre choisie par le partenaire
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'soumis', 'valide', 'refuse', 'publie')),
  mois_cible text,                      -- 'AAAA-MM' pour le type e-mail (mois de parution visé)
  motif_refus text,
  soumis_le timestamptz,
  valide_le timestamptz,
  valide_par uuid references parents(id) on delete set null,
  publie_le timestamptz,                -- rempli par le chantier e-mailing
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_partenaire_messages_partenaire on partenaire_messages(partenaire_id);
create index if not exists idx_partenaire_messages_statut on partenaire_messages(statut);
create index if not exists idx_partenaire_messages_mois on partenaire_messages(mois_cible);

alter table partenaire_messages enable row level security;
-- Aucune policy publique : espace partenaire authentifié (le partenaire ne
-- voit / ne modifie que SES messages, et seulement tant qu'ils sont en
-- 'brouillon'), back-office pour la validation (permission "avantages" en
-- attendant "partenaires").

-- Bucket privé dédié aux images de messages. Reste privé pour l'instant
-- (workflow brouillon → soumis → validé). Le chantier e-mailing décidera
-- comment exposer l'image dans le mail (bucket public dédié, copie, ou URL
-- signée longue baked dans la campagne).
insert into storage.buckets (id, name, public)
values ('partenaire-messages', 'partenaire-messages', false)
on conflict (id) do nothing;
