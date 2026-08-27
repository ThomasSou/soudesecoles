-- Découple l'identité d'un parent (sa fiche) de son compte de connexion.
-- Jusqu'ici `parents.id` ÉTAIT l'identifiant du compte auth.users : un
-- parent sans e-mail, ou un second parent partageant l'e-mail du premier,
-- n'avait tout simplement aucune fiche possible. `parents.id` devient un
-- identifiant autonome ; `auth_user_id` (facultatif) porte le lien vers le
-- compte, quand il existe.

alter table parents add column if not exists auth_user_id uuid;

-- Reprise de l'existant : jusqu'ici id ÉTAIT l'identifiant du compte.
update parents set auth_user_id = id where auth_user_id is null;

alter table parents drop constraint if exists parents_id_fkey;

alter table parents alter column id set default gen_random_uuid();

alter table parents
  add constraint parents_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete set null;

create unique index if not exists parents_auth_user_id_key
  on parents (auth_user_id) where auth_user_id is not null;

-- Un e-mail peut être absent (parent sans adresse), mais s'il est présent
-- il doit rester unique : c'est lui qui sert à inviter.
create unique index if not exists parents_email_key
  on parents (lower(email)) where email is not null and email <> '';

-- RLS : my_family_id() et la policy de modification de profil comparaient
-- directement parents.id à auth.uid() — elles doivent maintenant passer par
-- auth_user_id, sans quoi plus aucun parent ne verrait sa propre famille.
create or replace function public.my_family_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select family_id from parents where auth_user_id = auth.uid()
$$;

drop policy if exists "parent modifie son propre profil" on parents;
create policy "parent modifie son propre profil" on parents
  for update using (auth_user_id = auth.uid());
