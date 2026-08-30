-- ESPACE PARTENAIRES — NON APPLIQUÉ. Série d'intégration des 4 chantiers.
--
-- Documents déposés par le BUREAU à destination d'un partenaire (contrats,
-- conventions de partenariat, reçus...). Visibles dans l'espace du
-- partenaire concerné, en lecture / téléchargement uniquement.
-- Même schéma que les pièces jointes de remboursement (0024) : bucket
-- Storage privé + URL signée à courte durée de vie, jamais d'URL publique.

create table if not exists partenaire_documents (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references partenaires(id) on delete cascade,
  titre text not null,
  description text,
  chemin text not null,                 -- chemin dans le bucket "partenaire-documents"
  type_mime text,
  taille_octets integer,
  depose_le timestamptz not null default now(),
  depose_par uuid references parents(id) on delete set null
);

create index if not exists idx_partenaire_documents_partenaire
  on partenaire_documents(partenaire_id);

alter table partenaire_documents enable row level security;
-- Aucune policy publique : le partenaire accède à SES documents via
-- /api/partenaire/documents/[id]/fichier (jeton Supabase vérifié côté
-- serveur), le bureau via /api/admin/partenaires/[id]/documents/*
-- (permission "avantages"). Toutes ces routes utilisent la clé de service.

-- Bucket privé (public = false) : un contrat ne doit jamais être atteignable
-- par une URL devinable.
insert into storage.buckets (id, name, public)
values ('partenaire-documents', 'partenaire-documents', false)
on conflict (id) do nothing;
