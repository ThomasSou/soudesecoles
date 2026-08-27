-- Demandes de remboursement par les parents (frais engagés pour une
-- manifestation, un investissement général, un frais de fonctionnement, ou
-- autre chose), déposées depuis l'espace adhérent avec facture (obligatoire)
-- et RIB (facultatif), traitées ensuite par le bureau depuis le back-office.
-- Le virement lui-même reste manuel : cette table ne fait que suivre le
-- statut de chaque demande, elle ne déplace pas d'argent.

create table if not exists reimbursement_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  parent_id uuid not null references parents(id) on delete cascade,
  category text not null check (category in ('manifestation', 'investissement', 'fonctionnement', 'autre')),
  event_slug text,
  event_name text,
  description text,
  amount_cents integer not null check (amount_cents > 0),
  invoice_path text not null,
  rib_path text,
  status text not null default 'pending' check (status in ('pending', 'refused', 'reimbursed')),
  admin_note text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references parents(id) on delete set null
);

create index if not exists idx_reimbursement_requests_family on reimbursement_requests(family_id);
create index if not exists idx_reimbursement_requests_status on reimbursement_requests(status);

alter table reimbursement_requests enable row level security;
-- Pas de policy publique : le parent passe par les routes API
-- /api/remboursements/* (jeton vérifié côté serveur, accès à ses seules
-- demandes), le bureau par /api/admin/remboursements/* (permission
-- "remboursements") — toutes avec la clé de service.

-- Bucket privé : factures et RIB ne doivent jamais être accessibles par une
-- URL publique (contrairement aux images boutique/e-mails). Le back-office y
-- accède via une URL signée à courte durée de vie.
insert into storage.buckets (id, name, public)
values ('remboursements', 'remboursements', false)
on conflict (id) do nothing;
