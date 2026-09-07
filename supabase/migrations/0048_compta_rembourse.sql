-- ============================================================================
-- COMPTABILITÉ — suivi du remboursement, sur TOUTE ligne avancée par un
-- bénévole (qu'elle vienne d'une demande côté famille OU d'une saisie du
-- bureau « payé par un bénévole »).
-- ----------------------------------------------------------------------------
-- NON exécutée automatiquement : à coller/lancer à la main. Idempotente.
--
--   rembourse_le NULL  -> à rembourser (badge rouge)
--   rembourse_le posé  -> remboursé (badge vert)
--
-- Pour les lignes issues d'une demande (source = 'benevole'), « Marquer
-- remboursé » met aussi reimbursement_requests.status = 'reimbursed' pour
-- l'afficher sur la fiche du bénévole.
-- ============================================================================

alter table compta_lignes add column if not exists rembourse_le timestamptz;
alter table compta_lignes
  add column if not exists rembourse_par uuid references parents(id) on delete set null;
