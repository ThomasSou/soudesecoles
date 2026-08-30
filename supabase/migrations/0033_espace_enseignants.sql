-- ============================================================================
-- ESPACE ENSEIGNANTS / DIRECTION — échafaudage (NON APPLIQUÉ)
-- ----------------------------------------------------------------------------
-- Numéro PROVISOIRE : renuméroter (0033, 0034... selon l'état du dossier
-- supabase/migrations/ au moment de l'application) AVANT de coller dans
-- l'éditeur SQL Supabase. Comme toutes les migrations du projet, celle-ci
-- n'est PAS exécutée automatiquement : elle ne prendra effet qu'une fois
-- collée et lancée à la main dans le tableau de bord Supabase, puis vérifiée
-- par un `select` indépendant (le message « Success » de l'éditeur peut être
-- périmé).
--
-- Contenu :
--   1. Table `teachers`  — identité + rôle des enseignants / direction,
--      découplée du compte de connexion comme l'est déjà `parents`.
--   2. `invitations.teacher_id` — réutilise le circuit d'activation maison.
--   3. `teacher_quotes` (devis) + `teacher_quote_classes` (classes concernées).
--   4. `teacher_ribs` — RIB déposés en fichier (aucune saisie IBAN/BIC ;
--      `purged_at` : le fichier est supprimé au remboursement — décision D8).
--   5. `teacher_invoices` (factures) + `teacher_invoice_classes`.
--      `rib_received` garde la trace d'un RIB fourni puis purgé (D8).
--   6. `contact_messages` — colonnes d'origine (parent / partenaire /
--      enseignant / public) + identité expéditeur. Non destructif :
--      `from_type` par défaut 'public', les lignes et le formulaire public
--      existants ne changent pas.
--
-- RLS activé partout, AUCUNE policy publique : tout passe par des routes API
-- serveur (clé de service), comme le reste du back-office et l'espace
-- remboursements des parents.
--
-- Les fichiers (devis, factures, RIB) sont stockés dans le bucket privé
-- `remboursements` qui EXISTE DÉJÀ (créé par 0024), sous le préfixe
-- `enseignants/<teacher_id>/...`. Pas de nouveau bucket : on étend l'existant.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. teachers — un enseignant ou le/la directeur·rice
-- ----------------------------------------------------------------------------
-- Même principe que `parents` depuis la migration 0025 : l'identité (cette
-- fiche) est découplée du compte de connexion. `auth_user_id` porte le lien
-- vers auth.users quand le compte a été activé ; il reste nul entre la
-- création de la fiche et l'activation de l'invitation.
--
-- Décision D1 : un même compte auth.users PEUT être rattaché à la fois à une
-- fiche `parents` et à une fiche `teachers` (une directrice qui est aussi
-- parent d'élève, par exemple). Rien ne l'empêche : l'unicité
-- `teachers_auth_user_id_key` ci-dessous ne porte que sur `teachers`, elle
-- est indépendante de `parents_auth_user_id_key`. La redirection après
-- connexion tranche l'ambiguïté : bureau > enseignant > parent
-- (cf. app/lib/redirectionRole.js).
create table if not exists teachers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  first_name text,
  last_name text,
  email text not null,
  role text not null default 'enseignant'
    check (role in ('enseignant', 'direction')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  invited_at timestamptz
);

create unique index if not exists teachers_auth_user_id_key
  on teachers (auth_user_id) where auth_user_id is not null;

create unique index if not exists teachers_email_key
  on teachers (lower(email)) where email is not null and email <> '';

alter table teachers enable row level security;
-- Pas de policy publique : accès via /api/enseignant/* (jeton vérifié côté
-- serveur → teachers.auth_user_id) et /api/admin/enseignants/* (permission
-- « enseignants »), toujours avec la clé de service.


-- ----------------------------------------------------------------------------
-- 2. invitations.teacher_id — réutilisation du circuit d'activation maison
-- ----------------------------------------------------------------------------
-- Le circuit maison (cf. 0021 + app/lib/invitations.js) crée le compte
-- auth.users, pose un jeton à usage unique dans `invitations`, envoie l'e-mail
-- via Sender vers /activer-compte?jeton=... puis /api/activer-compte affecte
-- le mot de passe par `user_id`. Rien de tout cela n'est spécifique aux
-- parents SAUF la colonne de rattachement : on en ajoute une pour les
-- enseignants. `parent_id` et `teacher_id` sont mutuellement exclusifs.
alter table invitations
  add column if not exists teacher_id uuid references teachers(id) on delete set null;


-- ----------------------------------------------------------------------------
-- 3. teacher_quotes — DEVIS soumis au bureau pour financement
-- ----------------------------------------------------------------------------
-- Flux de statut : 'soumis' → 'valide' | 'refuse'. Le devis n'engage rien :
-- c'est la validation par le bureau qui autorise la dépense. Le fichier
-- (PDF ou photo) est OBLIGATOIRE.
create table if not exists teacher_quotes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  title text not null,
  description text,
  amount_cents integer not null check (amount_cents > 0),
  school_year text not null,
  status text not null default 'soumis'
    check (status in ('soumis', 'valide', 'refuse')),
  quote_file_path text not null,
  admin_note text,
  decided_at timestamptz,
  decided_by uuid references parents(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_teacher_quotes_teacher on teacher_quotes(teacher_id);
create index if not exists idx_teacher_quotes_status on teacher_quotes(status);
create index if not exists idx_teacher_quotes_year on teacher_quotes(school_year);

alter table teacher_quotes enable row level security;


-- Classes concernées par un devis (une ou PLUSIEURS — transports groupés,
-- projets inter-classes). On stocke le LIBELLÉ de la classe tel qu'il existe
-- dans children.class_level pour l'année scolaire concernée, pas une clé
-- étrangère : il n'y a pas de table `classes`, et les regroupements changent
-- chaque année (CE1-CE2 une année, CE1-CM une autre). Ce libellé figé est un
-- instantané : il reste lisible même si les fiches enfants changent ensuite.
create table if not exists teacher_quote_classes (
  quote_id uuid not null references teacher_quotes(id) on delete cascade,
  class_label text not null,
  primary key (quote_id, class_label)
);

alter table teacher_quote_classes enable row level security;


-- ----------------------------------------------------------------------------
-- 4. teacher_ribs — RIB déposés EN FICHIER (jamais de saisie IBAN/BIC)
-- ----------------------------------------------------------------------------
-- Éviter les erreurs de frappe : on ne stocke QUE le chemin du fichier
-- (PDF ou photo) dans le bucket privé. Un enseignant peut en avoir plusieurs
-- (RIB personnel, RIB de la coopérative de classe...). Une facture réutilise
-- ensuite un RIB via teacher_invoices.rib_id. Créée AVANT teacher_invoices
-- parce que celle-ci la référence.
--
-- Rétention (décision D8) : le fichier RIB ne survit pas au remboursement.
-- Dès qu'une facture qui utilise ce RIB passe à 'remboursee' ET qu'aucune
-- autre facture non remboursée ne le référence, le fichier du bucket est
-- supprimé, `rib_file_path` repasse à NULL et `purged_at` est horodaté. La
-- ligne est conservée pour l'historique (« ce RIB a existé »).
create table if not exists teacher_ribs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  label text,
  rib_file_path text,          -- NULL une fois le fichier purgé après remboursement
  purged_at timestamptz,       -- date de suppression du fichier
  created_at timestamptz not null default now()
);

create index if not exists idx_teacher_ribs_teacher on teacher_ribs(teacher_id);

alter table teacher_ribs enable row level security;


-- ----------------------------------------------------------------------------
-- 5. teacher_invoices — FACTURES de prestataires, pour remboursement
-- ----------------------------------------------------------------------------
-- Flux de statut : 'soumise' → 'remboursee'. AUCUN devis préalable requis :
-- une facture peut arriver seule. `quote_id` est un rattachement FACULTATIF,
-- utile quand la facture correspond à un devis déjà validé.
-- Le RIB peut être joint directement à la facture (`rib_file_path`) OU
-- pointer vers un RIB déjà déposé (`rib_id`, cf. teacher_ribs).
-- Décision D8 : au passage à 'remboursee', le fichier RIB (joint ou
-- réutilisé) est SUPPRIMÉ du bucket — une fois le virement fait, le
-- bénéficiaire est enregistré côté banque, le RIB ne sert plus. `rib_received`
-- garde la trace qu'un RIB avait bien été fourni.
create table if not exists teacher_invoices (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  quote_id uuid references teacher_quotes(id) on delete set null,
  label text not null,
  supplier_name text,
  description text,
  amount_cents integer not null check (amount_cents > 0),
  school_year text not null,
  status text not null default 'soumise'
    check (status in ('soumise', 'remboursee')),
  invoice_file_path text not null,
  rib_id uuid references teacher_ribs(id) on delete set null,
  rib_file_path text,           -- NULL après purge (remboursement) ou si rib_id utilisé
  rib_received boolean not null default false,  -- un RIB a été fourni à un moment
  admin_note text,
  reimbursed_at timestamptz,
  reimbursed_by uuid references parents(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_teacher_invoices_teacher on teacher_invoices(teacher_id);
create index if not exists idx_teacher_invoices_status on teacher_invoices(status);
create index if not exists idx_teacher_invoices_year on teacher_invoices(school_year);

alter table teacher_invoices enable row level security;


create table if not exists teacher_invoice_classes (
  invoice_id uuid not null references teacher_invoices(id) on delete cascade,
  class_label text not null,
  primary key (invoice_id, class_label)
);

alter table teacher_invoice_classes enable row level security;


-- ----------------------------------------------------------------------------
-- 6. contact_messages — origine du message + identité expéditeur
-- ----------------------------------------------------------------------------
-- « Messages reçus » du back-office regroupe déjà les messages du formulaire
-- public. On y ajoute la distinction d'origine sans rien casser :
--   - from_type 'public'      → formulaire public (comportement actuel, défaut)
--   - from_type 'parent'      → depuis l'espace adhérent (à brancher plus tard)
--   - from_type 'partenaire'  → depuis l'espace partenaire (fichiers verrouillés)
--   - from_type 'enseignant'  → depuis l'espace enseignant (cette livraison)
-- Les colonnes sender_* pointent vers la fiche d'origine quand elle existe.
alter table contact_messages
  add column if not exists from_type text not null default 'public';

alter table contact_messages
  drop constraint if exists contact_messages_from_type_check;
alter table contact_messages
  add constraint contact_messages_from_type_check
  check (from_type in ('public', 'parent', 'partenaire', 'enseignant'));

alter table contact_messages
  add column if not exists sender_parent_id uuid references parents(id) on delete set null;
alter table contact_messages
  add column if not exists sender_teacher_id uuid references teachers(id) on delete set null;
alter table contact_messages
  add column if not exists sender_partenaire_id uuid references partenaires(id) on delete set null;


-- ============================================================================
-- Rappels d'intégration (hors SQL, à faire dans le code le matin) :
--   - app/lib/adminAuth.js  : ajouter { key: "enseignants", label: "Devis et
--       factures des enseignants" } au tableau PERMISSIONS.
--   - app/admin/admin-shell.js : ajouter l'onglet
--       { href: "/admin/enseignants", label: "Enseignants", perm: "enseignants" }.
--   - app/connexion/page.js + app/activer-compte/page.js : rediriger selon le
--       rôle (bureau → /admin, enseignant → /espace-enseignant, sinon
--       /espace-adherent). Voir app/lib/redirectionRole.js (fourni) et
--       docs/conception-espace-enseignants.md.
--   - app/confidentialite : mentionner le stockage des RIB — bucket privé,
--       URL signées de courte durée, accès bureau uniquement, ET suppression
--       automatique du fichier RIB dès le remboursement de la facture (D8).
--   - app/admin/messages : badge + filtre d'origine (from_type) — intégration
--       partagée, PAS faite dans cette livraison (seule l'écriture
--       from_type='enseignant' l'est).
-- ============================================================================
