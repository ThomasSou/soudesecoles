-- Rôles du back-office.
-- Seuls les parents dont le rôle est 'admin_general' ou 'admin_commission'
-- accèdent à /admin (contrôle effectué côté serveur dans app/lib/adminAuth.js).
--
-- Pour donner l'accès à un autre membre du bureau, remplacer l'adresse :
--   update parents set role = 'admin_general' where email = '...';
-- Pour le retirer :
--   update parents set role = 'parent' where email = '...';

update parents set role = 'admin_general'
where email = 'thomas.ondet@gmail.com';
