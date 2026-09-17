-- ============================================================================
-- E-MAILS INVALIDES — signale une adresse qui a rebondi (bounce), pour ne
-- plus jamais essayer de lui envoyer un e-mail de campagne tant qu'elle
-- n'est pas corrigée, et afficher une alerte au bureau.
-- ----------------------------------------------------------------------------
-- Pas de détection automatique des rebonds pour l'instant (les campagnes
-- partent par SMTP direct, les rebonds arrivent dans la boîte contact@,
-- pas via un webhook) : le bureau marque une adresse invalide à la main
-- depuis /admin/familles quand il voit un rebond, comme ici pour les 10
-- adresses en échec de la campagne "Assemblée Générale" du 16/09/2026
-- (relevées dans la boîte contact@sou-montmerle.fr).
--
-- NON exécutée automatiquement : RELIRE puis remplacer "rollback" par
-- "commit".
-- ============================================================================
begin;

alter table parents add column if not exists email_invalide_le timestamptz;

update parents set email_invalide_le = '2026-09-16T17:29:00Z'
where id in (
  'b10eef17-0a1e-484a-a3e7-5734b75a466d', -- Vincent Pascal <vincepascou2742@gmail.com>
  '086044e1-7253-4fc9-9c19-f4424e00f829', -- Fanny Zira <fanny01-96@hotmail.fr>
  'b82c163a-7d58-457a-b3ee-a7af3b8fd982', -- Nicolas Mannechez <mannechez@gmail.com>
  'c2da6c21-13b2-44ba-a9e7-eeed88b93a50', -- Mélanie Catherin <mal-catherin@hotmail.com>
  'e5957392-1545-40fb-9bb3-7531630d9b86', -- Johan Mallet <john69400@outlook.fr>
  '5c1365b3-e1fc-444b-ad8d-7e76191b478a', -- Christophe Lanzone <lacalabrais69220@gmail.com>
  'd038b233-0b38-454b-97c1-4cea2a26ab41', -- Kouroufia Fofana <karoufdu87@gmail.com>
  'd31deb81-e6e3-4641-81dd-1564291dafc9', -- Thibaud Estiez <titouex@hotmail.fr>
  'da01b2be-f4da-46ce-9c1e-021ac4dd0ec9', -- Sullivan Ducroux <payzdioacino@gmail.com>
  'c1f95d6f-6a14-48c4-b25d-f5a576dee272'  -- Jérémy Di Stefano <j.distefano@laposte.net>
);

-- Vérif après commit :
-- select first_name, last_name, email, email_invalide_le from parents where email_invalide_le is not null order by last_name;
--   attendu : 10 lignes

rollback;  -- <<< remplacer par "commit;" après relecture
