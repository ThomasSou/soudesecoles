-- Éditeur d'e-mails par blocs : on garde le contenu structuré (pour pouvoir
-- rouvrir/dupliquer une campagne passée) en plus du HTML final envoyé.
alter table email_campaigns add column if not exists content_blocks jsonb not null default '[]'::jsonb;
alter table email_campaigns add column if not exists html text;

-- Bucket public pour les images insérées dans les e-mails (logos, photos
-- d'événements...). Upload réservé au back-office (route serveur, clé de
-- service) ; lecture publique nécessaire pour que les images s'affichent
-- dans les clients mail.
insert into storage.buckets (id, name, public)
values ('email-images', 'email-images', true)
on conflict (id) do nothing;
