-- Correction : "infinite recursion detected in policy for relation parents"
--
-- La policy SELECT sur `parents` interrogeait la table `parents` elle-même
-- dans sa propre condition USING. Chaque lecture de `parents` réévalue la
-- policy, qui relit `parents`, etc. -> récursion infinie.
--
-- Fix standard Supabase : passer par une fonction SECURITY DEFINER qui,
-- elle, contourne RLS pour aller chercher le family_id de l'utilisateur
-- connecté. Les policies appellent ensuite cette fonction au lieu de
-- refaire un SELECT sur la table protégée.

create or replace function public.my_family_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select family_id from parents where id = auth.uid()
$$;

drop policy if exists "parent lit sa famille" on families;
create policy "parent lit sa famille" on families
  for select using (id = public.my_family_id());

drop policy if exists "parent lit son profil et celui de son conjoint" on parents;
create policy "parent lit son profil et celui de son conjoint" on parents
  for select using (family_id = public.my_family_id());

drop policy if exists "parent lit les enfants de sa famille" on children;
create policy "parent lit les enfants de sa famille" on children
  for select using (family_id = public.my_family_id());

drop policy if exists "parent lit l'adhesion de sa famille" on memberships;
create policy "parent lit l'adhesion de sa famille" on memberships
  for select using (family_id = public.my_family_id());
