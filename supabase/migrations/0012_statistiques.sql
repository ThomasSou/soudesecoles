-- Statistiques de fréquentation, sans cookie ni donnée personnelle.
-- On n'enregistre ni adresse IP, ni identifiant de visiteur : uniquement des
-- compteurs agrégés par jour. Il est donc impossible de reconstituer le
-- parcours d'une personne, ce qui dispense le site de bandeau de consentement.
--
--   kind   : 'page' (page vue), 'lien' (clic sortant),
--            'email_ouverture', 'email_clic'
--   target : chemin de la page, URL externe, ou objet de l'envoi d'e-mail
create table if not exists stats_daily (
  id uuid primary key default gen_random_uuid(),
  day date not null default current_date,
  kind text not null,
  target text not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (day, kind, target)
);

create index if not exists stats_daily_day_idx on stats_daily (day desc);
create index if not exists stats_daily_kind_idx on stats_daily (kind);

-- Aucune policy publique : seules les routes serveur (clé de service)
-- peuvent lire et écrire. L'incrémentation est faite côté application
-- (app/lib/stats.js), sans fonction SQL stockée.
alter table stats_daily enable row level security;
