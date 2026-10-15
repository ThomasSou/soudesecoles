-- ============================================================================
-- COMPTABILITÉ — relevé bancaire : opérations importées du Crédit Agricole et
-- pointage avec les lignes de comptabilité.
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main dans le SQL Editor
-- Supabase, puis vérifier par un `select` indépendant — le message
-- « Success » de l'éditeur peut être périmé. Idempotente.
--
-- Une ligne = une opération du relevé (débit ou crédit).
--   cle        identifiant stable de l'opération (compte|date|sens|montant|
--              libellé|n°) : réimporter un fichier qui recouvre une période
--              déjà importée ne crée aucun doublon.
--   statut     a_pointer  -> pas encore rapprochée de la compta
--              pointee    -> rapprochée d'une ligne de compta (ligne_id)
--              ignoree    -> hors compta (virement interne, erreur...) ; `note`
--                            dit pourquoi
--   mode_pointage  'auto' (rapprochement sûr fait à l'import) ou 'manuel'
--
-- Une ligne de compta ne peut être rapprochée que d'UNE opération (index
-- unique sur ligne_id).
--
-- RLS activé, AUCUNE policy publique : tout passe par
-- /api/admin/comptabilite/releve/* (permission « comptabilite », clé de service).
-- ============================================================================

create table if not exists compta_operations (
  id uuid primary key default gen_random_uuid(),
  cle text not null unique,
  compte text not null default 'courant' check (compte in ('courant', 'placement')),
  date_operation date not null,
  type_operation text,
  libelle text not null,
  detail text,
  sens text not null check (sens in ('depense', 'recette')),
  montant_cents integer not null check (montant_cents > 0),
  statut text not null default 'a_pointer' check (statut in ('a_pointer', 'pointee', 'ignoree')),
  ligne_id uuid references compta_lignes(id) on delete set null,
  mode_pointage text check (mode_pointage is null or mode_pointage in ('auto', 'manuel')),
  note text,
  pointee_le timestamptz,
  pointee_par uuid references parents(id) on delete set null,
  importe_le timestamptz not null default now(),
  importe_par uuid references parents(id) on delete set null
);

create unique index if not exists compta_operations_ligne_key
  on compta_operations (ligne_id)
  where ligne_id is not null;

create index if not exists idx_compta_operations_date on compta_operations (date_operation);
create index if not exists idx_compta_operations_statut on compta_operations (statut);

alter table compta_operations enable row level security;
-- Pas de policy publique : lecture et écriture par les routes serveur.

-- Vérif après commit :
-- select count(*) from compta_operations;
--   attendu : 0 (table vide avant le premier import)

rollback;  -- <<< remplacer par "commit;" après relecture
