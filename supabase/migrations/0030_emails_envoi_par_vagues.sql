-- Envoi des campagnes e-mail par vagues, avec reprise.
-- Une campagne "Toute l'école" (~450 familles) ne tient pas dans une seule
-- requete serveur (temps d'execution limite chez Netlify). L'envoi se fait
-- donc vague par vague : chaque appel traite un lot de destinataires,
-- enregistre l'avancement ici, et rend la main. Si l'envoi est interrompu
-- (onglet ferme, fonction coupee), il reprend a `next_index`.
--
--   status      : 'termine' (defaut, compatible avec l'historique existant)
--                 ou 'en_cours' tant qu'il reste des vagues a envoyer.
--   next_index  : position du prochain destinataire a traiter.
--   recipients  : liste figee des destinataires (email + prenom + statut),
--                 videe une fois l'envoi termine (donnee perso inutile apres).
--   updated_at  : derniere progression, pour reperer une campagne bloquee.

alter table email_campaigns add column if not exists status text not null default 'termine';
alter table email_campaigns add column if not exists next_index integer not null default 0;
alter table email_campaigns add column if not exists recipients jsonb not null default '[]'::jsonb;
alter table email_campaigns add column if not exists updated_at timestamptz;
