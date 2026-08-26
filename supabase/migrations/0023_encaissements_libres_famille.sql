-- Rattachement facultatif d'un encaissement libre à une famille : une fois
-- payé, il est recopié dans `purchases` (comme la boutique) pour apparaître
-- dans l'historique d'achat du parent sur /espace-adherent.

alter table encaissements_libres add column if not exists family_id uuid references families(id) on delete set null;
