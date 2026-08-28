-- Traçabilité de la décision prise sur une demande d'inscription.
-- Jusqu'ici on ne gardait que `status` (pending / approved / refused) :
-- impossible de savoir qui a tranché, quand, ni de joindre un motif à la
-- personne. Le back-office envoie désormais un e-mail de confirmation dans
-- tous les cas (accepté comme refusé) ; `decision_message` porte le mot
-- éventuellement saisi par le bureau et repris dans cet e-mail.

alter table registration_requests add column if not exists decision_message text;
alter table registration_requests add column if not exists decided_at timestamptz;
alter table registration_requests
  add column if not exists decided_by uuid references parents(id) on delete set null;
