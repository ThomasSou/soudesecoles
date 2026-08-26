-- Encaissements libres : paiement HelloAsso hors boutique et cotisation,
-- pour tout encaissement ponctuel (ex : remboursement personnel d'un rachat
-- d'invendus après une manifestation). Créé depuis le back-office (nom,
-- motif, montant), payé par carte via HelloAsso plutôt que SumUp — pas de
-- frais de terminal.

create table if not exists encaissements_libres (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  motif text not null,
  montant_cents integer not null check (montant_cents > 0),
  checkout_intent_id text,
  helloasso_order_id text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_by uuid references parents(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_encaissements_libres_status on encaissements_libres(status);

alter table encaissements_libres enable row level security;
-- Pas de policy publique : uniquement accessible via les routes API du
-- back-office (permission "encaissements"), avec la clé de service.
