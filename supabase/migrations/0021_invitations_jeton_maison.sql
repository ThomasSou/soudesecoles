-- Circuit d'activation maison, qui contourne generateLink()/inviteUserByEmail().
--
-- Constat en production : ces deux fonctions Supabase échouent de façon
-- fiable et reproductible dès qu'elles sont appelées par programmation
-- (notre clé API), avec une fausse alerte SPF/DKIM/DMARC — alors que le même
-- envoi natif, déclenché à la main depuis le tableau de bord Supabase,
-- réussit à chaque fois avec la même configuration SMTP. Aucune trace de
-- l'échec n'apparaît dans les journaux Supabase (auth_logs) : le blocage a
-- lieu avant toute journalisation, probablement une vérification de
-- livrabilité propre aux appels par clé API. Cela rend cette fonction
-- totalement inutilisable pour le renvoi individuel comme pour l'envoi en
-- masse (450+ familles).
--
-- Nouveau circuit (utilisé uniquement quand Sender est configuré) :
-- 1. On crée nous-mêmes le compte auth.users (createUser, email_confirm
--    d'emblée) ou on réutilise le compte existant si déjà importé.
-- 2. On génère notre propre jeton à usage unique, stocké ici avec une
--    expiration.
-- 3. On envoie nous-mêmes l'e-mail via Sender, avec un lien vers
--    /activer-compte?jeton=...
-- 4. Une fois le mot de passe choisi, une route API dédiée retrouve le
--    compte via le jeton et lui affecte le mot de passe (updateUserById) :
--    cette fonction-là n'a jamais posé de problème, elle n'envoie aucun
--    e-mail.
--
-- Les liens déjà envoyés via l'ancien circuit (jetons Supabase dans l'URL)
-- continuent de fonctionner normalement : la page /activer-compte gère les
-- deux formats.

alter table invitations add column if not exists token uuid not null default gen_random_uuid();
alter table invitations add column if not exists user_id uuid;
alter table invitations add column if not exists expires_at timestamptz;
alter table invitations add column if not exists used_at timestamptz;

create unique index if not exists idx_invitations_token on invitations(token);
