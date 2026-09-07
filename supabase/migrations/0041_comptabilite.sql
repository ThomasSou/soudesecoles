-- ============================================================================
-- COMPTABILITÉ — Phase 1 (dépenses / recettes par événement, par classe,
-- investissement, fonctionnement courant ; saisie manuelle + pointage).
-- ----------------------------------------------------------------------------
-- Comme toutes les migrations du projet : NON exécutée automatiquement. À
-- coller et lancer à la main dans le tableau de bord Supabase (SQL Editor),
-- puis vérifier par un `select` indépendant — le message « Success » de
-- l'éditeur peut être périmé.
--
-- Association loi 1901 : PAS de gestion de TVA, tout est en TTC. Un seul
-- montant par ligne (`montant_cents`, entier de centimes, comme le reste du
-- projet : teacher_invoices, boutique...).
--
-- Périmètre Phase 1 :
--   1. `compta_lignes`        — une ligne = un mouvement (ou une ligne
--      prévue). Dépense ou recette, rattachée à UNE rubrique :
--      événement / investissement / courant / classe.
--   2. `compta_ligne_classes` — pour une ligne « classe », la ou les classes
--      concernées (libellé figé, comme teacher_invoice_classes). Le montant
--      ENTIER compte pour chaque classe dans le récap par classe (même
--      convention que le bilan enseignants) ; le rapprochement bancaire,
--      lui, ne compte la ligne qu'une fois.
--
-- Les factures des enseignants (teacher_invoices) sont recopiées en lignes
-- de compta (`source = 'enseignant'`, `teacher_invoice_id` renseigné) par la
-- route GET /api/admin/comptabilite lors de son premier appel de la journée —
-- pas de trigger SQL, cohérent avec le reste du projet.
--
-- Phases suivantes (hors de cette migration) : import des relevés Crédit
-- Agricole + auto-pointage ; lignes récurrentes pré-remplies d'une édition
-- à l'autre ; recettes HelloAsso automatiques.
--
-- RLS activé, AUCUNE policy publique : tout passe par
-- /api/admin/comptabilite/* (permission « comptabilite », clé de service).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. compta_lignes
-- ----------------------------------------------------------------------------
create table if not exists compta_lignes (
  id uuid primary key default gen_random_uuid(),

  -- Sens du mouvement.
  sens text not null check (sens in ('depense', 'recette')),

  -- Rattachement : exactement une rubrique.
  --   evenement       -> evenement_id renseigné (benevolat_evenements)
  --   investissement  -> dépense d'investissement générale
  --   courant         -> frais de fonctionnement courant
  --   classe          -> voir compta_ligne_classes
  rubrique text not null check (rubrique in ('evenement', 'investissement', 'courant', 'classe')),
  evenement_id uuid references benevolat_evenements(id) on delete set null,

  libelle text not null,
  fournisseur text,
  montant_cents integer not null check (montant_cents > 0),

  -- Date de l'opération (facultative tant que la ligne n'est pas pointée :
  -- une ligne « prévue » n'a pas encore de date).
  date_operation date,

  -- Cycle de vie :
  --   prevu       -> ligne pré-remplie / attendue, rien d'engagé encore
  --   a_verifier  -> dépense ou recette saisie, en attente de rapprochement
  --   pointe      -> rapprochée avec le relevé bancaire
  statut text not null default 'a_verifier'
    check (statut in ('prevu', 'a_verifier', 'pointe')),

  -- Origine de la ligne.
  --   manuel      -> saisie par le bureau
  --   enseignant  -> recopiée depuis teacher_invoices
  --   import      -> issue d'un relevé bancaire importé (Phase 2)
  source text not null default 'manuel'
    check (source in ('manuel', 'enseignant', 'import')),
  teacher_invoice_id uuid references teacher_invoices(id) on delete set null,

  -- Compte bancaire concerné (Crédit Agricole : un compte courant, un compte
  -- de placement). NULL tant que non pointé.
  compte text check (compte in ('courant', 'placement')),

  -- Rempli au pointage : libellé / référence de la ligne du relevé.
  ref_bancaire text,

  note text,
  school_year text not null,

  pointe_le timestamptz,
  pointe_par uuid references parents(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references parents(id) on delete set null,

  -- Une ligne « événement » doit désigner un événement.
  constraint compta_lignes_evenement_coherent
    check (rubrique <> 'evenement' or evenement_id is not null)
);

-- Une facture enseignant n'est recopiée qu'une seule fois.
create unique index if not exists compta_lignes_teacher_invoice_key
  on compta_lignes (teacher_invoice_id)
  where teacher_invoice_id is not null;

create index if not exists idx_compta_lignes_year on compta_lignes (school_year);
create index if not exists idx_compta_lignes_evenement on compta_lignes (evenement_id);
create index if not exists idx_compta_lignes_statut on compta_lignes (statut);
create index if not exists idx_compta_lignes_rubrique on compta_lignes (rubrique);

alter table compta_lignes enable row level security;
-- Pas de policy publique : accès via /api/admin/comptabilite/* uniquement.


-- ----------------------------------------------------------------------------
-- 2. compta_ligne_classes — classes concernées par une ligne « classe »
-- ----------------------------------------------------------------------------
-- Libellé figé (children.class_level de l'année concernée), pas de clé
-- étrangère : il n'y a pas de table `classes` et les regroupements changent
-- chaque année. Même choix que teacher_quote_classes / teacher_invoice_classes.
create table if not exists compta_ligne_classes (
  ligne_id uuid not null references compta_lignes(id) on delete cascade,
  class_label text not null,
  primary key (ligne_id, class_label)
);

alter table compta_ligne_classes enable row level security;


-- ============================================================================
-- Rappels d'intégration (FAITS dans le même commit) :
--   - app/lib/adminAuth.js      : permission "comptabilite" ajoutée.
--   - app/admin/admin-shell.js  : onglet /admin/comptabilite ajouté.
--   - app/admin/comptabilite/   : page back-office.
--   - app/api/admin/comptabilite/ : routes GET/POST + [id] PATCH/DELETE.
-- ============================================================================
