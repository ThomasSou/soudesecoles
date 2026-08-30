-- ============================================================================
-- CONTACT_MESSAGES — origine du message + identité de l'expéditeur
-- ----------------------------------------------------------------------------
-- Migration COMMUNE aux chantiers « espace partenaires » et « espace
-- enseignants ». Elle remplace l'ancienne proposition partenaires
-- (`source` + `auteur_parent_id` + `auteur_partenaire_id`) : on retient le
-- schéma enseignants, plus complet (un `sender_*` par type de fiche).
--
-- Placée en 0040, APRÈS :
--   - 0034_espace_enseignants.sql     → crée `teachers`
--   - 0035_partenaires_comptes.sql     → (partenaires existe depuis 0020)
-- car les FK ci-dessous référencent `teachers(id)` ET `partenaires(id)`.
--
-- Non destructif : `from_type` a une valeur par défaut 'public', les lignes
-- existantes et le formulaire public (/api/contact) continuent de fonctionner
-- sans changement. Seules les routes authentifiées renseignent une autre
-- origine :
--   - from_type 'parent'      + sender_parent_id      → /api/contact avec jeton
--   - from_type 'partenaire'  + sender_partenaire_id  → /api/partenaire/contact
--   - from_type 'enseignant'  + sender_teacher_id     → /api/enseignant/messages
--
-- NON APPLIQUÉE automatiquement : à coller et lancer à la main dans l'éditeur
-- SQL Supabase, puis vérifier par un `select` indépendant.
-- ============================================================================

alter table contact_messages
  add column if not exists from_type text not null default 'public';

alter table contact_messages
  drop constraint if exists contact_messages_from_type_check;
alter table contact_messages
  add constraint contact_messages_from_type_check
  check (from_type in ('public', 'parent', 'partenaire', 'enseignant'));

alter table contact_messages
  add column if not exists sender_parent_id uuid references parents(id) on delete set null;
alter table contact_messages
  add column if not exists sender_teacher_id uuid references teachers(id) on delete set null;
alter table contact_messages
  add column if not exists sender_partenaire_id uuid references partenaires(id) on delete set null;

create index if not exists idx_contact_messages_from_type on contact_messages(from_type);
