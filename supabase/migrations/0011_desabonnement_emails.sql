-- Desinscription des e-mails (lien en pied de chaque envoi).
alter table parents add column if not exists email_opt_out boolean not null default false;
