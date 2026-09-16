-- ============================================================================
-- MATERNELLE 2026-2027 — sépare la classe (physique, un·e enseignant·e) du
-- niveau individuel de l'enfant (PS/MS/GS), et corrige les classes à double
-- niveau qui avaient été aplaties sur 3 classes au lieu de 5.
-- ----------------------------------------------------------------------------
-- Bug signalé par Thomas : le site n'affichait que 3 classes de maternelle
-- (PS/MS/GS, une avec 40 enfants) alors qu'il y a réellement 5 classes,
-- dont deux à double niveau (Petits-Moyens, Moyens-Grands). class_level
-- servait à la fois de "classe" (cas de l'élémentaire, ex. "CP-CE1") et de
-- "niveau individuel" (cas de la maternelle jusqu'ici) — d'où l'ambiguïté.
-- Conséquence collatérale : le nom d'enseignant·e affiché aux familles
-- (déduit de class_level via classesReference.js) était donc faux pour les
-- enfants des deux classes à double niveau.
--
-- Source de vérité : listes officielles de l'école éditées le 21/07/2026 et
-- le 31/08/2026 (PDF "Maternelle LISTES 5 CLASSES", transmis par Thomas) :
--   Grands (GS, 22) — Cécile Perdreaux
--   Moyens-Grands (MS-GS, 22 : 15 GS + 7 MS) — Alexandra Elie
--   Moyens (MS, 21) — Amandine Croze
--   Petits-Moyens (PS-MS, 20 : 12 MS + 8 PS) — Nathalie Bouquin
--   Petite section (PS, 19) — Nancy Olivier
-- Total 104, qui concorde exactement avec le comptage en base par niveau
-- avant migration (PS=27, MS=40, GS=37 — vérifié avant d'écrire ce SQL).
--
-- NON exécutée automatiquement : RELIRE puis remplacer "rollback" par
-- "commit". Vérifier ensuite avec la requête en bas de fichier.
-- ============================================================================
begin;

-- 1) Nouvelle colonne : niveau individuel de l'enfant, distinct de la classe.
alter table children add column if not exists niveau text;

-- 2) Le class_level actuel de TOUT enfant de maternelle est déjà son niveau
--    individuel correct (PS/MS/GS) — y compris pour les enfants des deux
--    classes à double niveau, dont le niveau exact est vérifié un par un
--    ci-dessous. On le recopie donc tel quel dans la nouvelle colonne.
update children set niveau = class_level
where school_year = '2026-2027' and class_level in ('PS', 'MS', 'GS');

-- 3) Classe "Moyens-Grands" (Alexandra Elie) — 22 enfants actuellement
--    étiquetés simplement PS/MS/GS, qui appartiennent en réalité à cette
--    classe à double niveau.
update children set class_level = 'MS-GS' where id in (
  -- niveau GS (15)
  'd986ff26-444a-4e8e-8056-705028324470', -- Tupin Lucie
  '4e5d863a-428b-42e7-8771-fda316d750c4', -- Sapin Gary
  '5e8acdc2-27ab-4ff6-8a99-ccc8afb44531', -- Pérez Polanchet Camille
  'a72a2d7e-4267-411d-9c22-a05fa64f9c52', -- Meunier Eliot
  '2d47b35a-bb3f-4795-b03d-57dccd0b2ffe', -- Heller Benjamin
  '303d4d56-43bb-4b72-b520-6bee4fa1d619', -- Guillard Lola
  '1263729e-c7b9-4d88-a3d0-e24f27d6ff64', -- Geliza Pilot Gabriel
  '76a26e63-f99f-46c7-8d4e-e5329cf29987', -- Gaillard Spinicci Elycia
  '7abdd259-be09-497c-a295-752c6e96ed00', -- Estiez Hope
  'a256020f-869a-4119-a088-8b07c87f36d4', -- Demircan Ela
  '86be6d97-f98f-413a-a9c8-548ec6cbd0d4', -- Colletta Gabin
  '5e9ff7a3-435e-49b1-b54e-b51de8bbefbc', -- Chennouf Leyna
  'aa22b1f2-ba28-4c38-bff9-2d1cb2f0e805', -- Benachour Alia
  '49594d0e-9f7d-49a5-9aa0-d9011c5db421', -- Barrot Lou
  '57c3e1e9-b3ec-4874-81c4-54171b0c6b20', -- Abadie Loïc
  -- niveau MS (7)
  '22337012-0445-47bc-87fa-a2ff840f5a6c', -- Vieira Ruffin Eden
  'b55b4b54-a106-4e40-8776-13915bec26f3', -- Gomes Chereau Andréa
  '7b5ec1f9-c1a1-441f-a4cf-62f2c518a2fd', -- Fontecoba Ruben
  '22b8aa78-e736-4cd4-a817-9f8db6a4fdaf', -- Diaby Nelya
  '6e84c5f5-094b-45db-90b3-fb93a1a70eb3', -- Canonier Émilie
  '7ccffd81-2f55-4741-acfd-7647395faef5', -- Caclin Cavalheiro Alix
  'ffb6bdaf-f62c-44ff-ad74-049d8176b1ff'  -- Barbey Léon
) and school_year = '2026-2027';

-- 4) Classe "Petits-Moyens" (Nathalie Bouquin) — 20 enfants.
update children set class_level = 'PS-MS' where id in (
  -- niveau MS (12)
  '046cf393-c233-426c-b827-e1ee52a5cc91', -- Velasquez Baron Alba
  '3e541476-702c-4389-83da-fa752a03497d', -- Vailleau Noah
  '008a1a2b-4443-43fb-89c2-7bf659334593', -- Trillat Nathan
  'eeec7e02-2fa5-46c1-b2c8-b359c9ea0ac8', -- Sanchez Malo
  'ccce8311-8d62-4713-9760-d99b99f85eea', -- Petrot Robin
  '714a0ac1-41f5-44c7-8896-a4ab416a9daa', -- Meunier Stan
  '3093d986-6c12-4b28-8daf-880f1a60db3b', -- Marinho Selena
  '18065298-f15f-4042-999a-bab96622ece8', -- Lachaze Milo
  'eccb5822-5b9a-4915-8b11-b73061ea0625', -- Gaillard Spinicci Lowgan
  '83391063-4fd5-4deb-87a5-e415ca3535ba', -- Fournel Agathe
  '568b5580-56d1-4938-8fe1-3bd5bafb5208', -- Chatelet Mylan
  'bf161f5f-9379-4132-8dd7-4a882a357d19', -- André Rose
  -- niveau PS (8)
  '60e27668-ef1b-4a0b-9049-c9000902a349', -- Roussel Olivia
  '2f2cdd5d-6e90-4d55-8fab-ec4a5da7d50a', -- Rigonnet Eva
  '653150e0-4eae-4e3d-b296-2f9abe120019', -- Plane Timéo
  '832d6fa3-9e17-4fb0-a35e-0ee8aba3ee05', -- Durand Vivaldi Milan
  '4372699e-08ce-43d4-bd64-a7d0230ea248', -- Colletta Louis
  '61217432-b1c3-4565-b329-d8d3c1956175', -- Carriez Lyam
  '3a16cf8d-ca77-4ca3-b090-ba1d7e3657c7', -- Brillant Gelas Zoé
  'fbe7de24-0e84-4336-9639-c24e56fb7a25'  -- Beseme Simone
) and school_year = '2026-2027';

-- Vérifs après commit :
-- select class_level, count(*) from children where school_year='2026-2027' and niveau is not null group by 1 order by 1;
--   attendu : GS 22, MS 21, MS-GS 22, PS 19, PS-MS 20  (total 104)
-- select niveau, count(*) from children where school_year='2026-2027' and niveau is not null group by 1 order by 1;
--   attendu : GS 37, MS 40, PS 27  (inchangé par rapport à avant migration)

rollback;  -- <<< remplacer par "commit;" après relecture
