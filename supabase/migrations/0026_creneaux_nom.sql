-- Nom facultatif pour un créneau (ex : "Service midi", "Installation"),
-- utile quand un atelier a plusieurs créneaux à distinguer autrement que
-- par l'horaire. Vide par défaut, l'horaire seul reste affiché sinon.

alter table benevolat_creneaux add column if not exists nom text;
