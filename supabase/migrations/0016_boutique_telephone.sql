-- Le téléphone de l'acheteur est désormais demandé à la commande (utile
-- pour les manifestations : retrait sur place, contact en cas de souci),
-- y compris pour les visiteurs sans compte famille.

alter table shop_orders add column if not exists buyer_phone text;
