-- ÉCHAFAUDAGE — espace partenaires. Numéro provisoire, À RENUMÉROTER.
--
-- Le formulaire de contact de l'espace partenaire arrive dans le MÊME
-- "Messages reçus" du back-office (`contact_messages`). Il faut pouvoir
-- distinguer l'origine d'un message : visiteur public / parent connecté /
-- partenaire connecté / enseignant connecté.
--
-- Compatibilité : les lignes existantes prennent la valeur 'public'. La
-- route publique /api/contact continue de fonctionner sans changement
-- (valeur par défaut). Seules les routes AUTHENTIFIÉES renseignent une autre
-- source. Le sous-agent "espace enseignants" ajoutera simplement la valeur
-- 'enseignant' ci-dessous et son `auteur_enseignant_id` s'il en a un.

alter table contact_messages add column if not exists source text not null default 'public';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contact_messages_source_check'
  ) then
    alter table contact_messages
      add constraint contact_messages_source_check
      check (source in ('public', 'parent', 'partenaire', 'enseignant'));
  end if;
end $$;

alter table contact_messages add column if not exists auteur_parent_id uuid
  references parents(id) on delete set null;
alter table contact_messages add column if not exists auteur_partenaire_id uuid
  references partenaires(id) on delete set null;

create index if not exists idx_contact_messages_source on contact_messages(source);
