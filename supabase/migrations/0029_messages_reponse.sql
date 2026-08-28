-- Réponse à un message du formulaire de contact, directement depuis le
-- back-office. Avant, le bouton « Répondre » ouvrait le client mail local
-- (mailto:) : la réponse partait de la boîte perso du membre du bureau et
-- ne laissait aucune trace. On envoie maintenant la réponse par SMTP depuis
-- contact@sou-montmerle.fr et on la conserve sur le message.

alter table contact_messages add column if not exists reply_body text;
alter table contact_messages add column if not exists replied_at timestamptz;
alter table contact_messages
  add column if not exists replied_by uuid references parents(id) on delete set null;
