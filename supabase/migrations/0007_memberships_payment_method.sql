-- Ajoute le moyen de paiement à l'adhésion, pour tracer les encaissements
-- manuels (chèque, espèces) faits depuis le back-office.

alter table memberships add column if not exists payment_method text;

alter table memberships drop constraint if exists memberships_payment_method_check;
alter table memberships add constraint memberships_payment_method_check
  check (payment_method in ('helloasso', 'sumup', 'especes', 'cheque') or payment_method is null);

alter table memberships add column if not exists note text;
