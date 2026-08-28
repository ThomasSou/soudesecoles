-- Option pour joindre à une campagne e-mail le planning des créneaux
-- bénévoles d'un événement. Au moment de l'envoi, le back-office insère un
-- récapitulatif "il reste X places sur Y" (places de l'instant de l'envoi),
-- avec un lien vers la page publique /benevoles, toujours à jour.
-- La colonne reste nulle pour les campagnes sans planning.

alter table email_campaigns
  add column if not exists benevoles_evenement_id uuid
  references benevolat_evenements(id) on delete set null;
