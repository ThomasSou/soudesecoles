-- ÉCHAFAUDAGE — espace partenaires. Numéro provisoire, À RENUMÉROTER.
--
-- Suivi de l'HISTORIQUE des avantages proposés par les partenaires. La
-- CONSOMMATION par les familles est déjà tracée par `avantage_utilisations`
-- (0013 / 0018) — on ne touche pas à cette table. Ce fichier ajoute la trace
-- des OFFRES elles-mêmes : quand un partenaire crée, modifie, active ou
-- désactive un avantage, on garde une ligne d'historique. Le bureau dispose
-- ainsi d'une frise "ce que ce partenaire a proposé, et depuis quand".
--
-- Rappel : `avantages.limite` EST déjà "la quantité offerte par famille"
-- demandée par Thomas — l'espace partenaire l'affiche sous ce nom, aucune
-- colonne supplémentaire n'est nécessaire.

-- Texte détaillé optionnel affiché aux familles, en plus du libellé court.
alter table avantages add column if not exists description text;
alter table avantages add column if not exists updated_at timestamptz not null default now();

create table if not exists avantage_evenements (
  id uuid primary key default gen_random_uuid(),
  avantage_id uuid not null references avantages(id) on delete cascade,
  partenaire_id uuid references partenaires(id) on delete set null,
  action text not null
    check (action in ('cree', 'modifie', 'active', 'desactive', 'supprime')),
  -- Instantané des champs au moment de l'évènement (label, limite,
  -- requiert_adhesion, description...), pour pouvoir reconstituer l'offre
  -- telle qu'elle était sans dépendre de l'état actuel de la ligne.
  details jsonb not null default '{}'::jsonb,
  -- Qui : "partenaire" (le partenaire lui-même depuis son espace) ou le nom
  -- du membre du bureau. On stocke un libellé libre plutôt qu'une FK car
  -- l'auteur peut être un partenaire (pas de ligne dans `parents`).
  auteur text,
  created_at timestamptz not null default now()
);

create index if not exists idx_avantage_evenements_avantage
  on avantage_evenements(avantage_id);
create index if not exists idx_avantage_evenements_partenaire
  on avantage_evenements(partenaire_id);

alter table avantage_evenements enable row level security;
-- Aucune policy publique : écrit par les routes serveur (espace partenaire
-- authentifié + back-office), lu par le back-office (permission "avantages").
