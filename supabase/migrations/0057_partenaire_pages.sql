-- ============================================================================
-- PARTENAIRES — page publique modifiable par le partenaire, validée par le bureau.
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un `select` indépendant — le message
-- « Success » de l'éditeur peut être périmé. Idempotente.
--
-- partenaire_pages : une ligne par partenaire.
--   brouillon : ce que le partenaire est en train d'écrire
--   publie    : la version validée, celle que voient les visiteurs
--   statut    : brouillon | soumis | refuse | publie
-- Le partenaire ne modifie jamais `publie` : seul le bureau le fait, en validant.
--
-- Bucket PUBLIC « partenaire-pages » : les photos des pages publiées doivent
-- être lisibles par tout le monde. Seules les routes serveur y écrivent.
-- RLS activé, AUCUNE policy : tout passe par les routes serveur.
-- ============================================================================

begin;

create table if not exists partenaire_pages (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null unique references partenaires(id) on delete cascade,
  brouillon jsonb,
  publie jsonb,
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'soumis', 'refuse', 'publie')),
  motif_refus text,
  soumis_le timestamptz,
  publie_le timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_partenaire_pages_statut on partenaire_pages (statut);

alter table partenaire_pages enable row level security;

insert into storage.buckets (id, name, public)
values ('partenaire-pages', 'partenaire-pages', true)
on conflict (id) do nothing;

-- Vérif après commit :
-- select (select count(*) from partenaire_pages) as pages,
--        (select public from storage.buckets where id = 'partenaire-pages') as bucket_public;
--   attendu : 0 et true
--
-- Rappel : la page publique /partenaires/<slug> n'affiche la version publiée que si
-- partenaires.slug (fiche du partenaire dans le back-office) est identique à
-- l'adresse de la page (barrels, diennet, nicod, spar, millesime, emilejob,
-- maitresdeboucheurs). À vérifier fiche par fiche.

rollback;  -- <<< remplacer par "commit;" après relecture
