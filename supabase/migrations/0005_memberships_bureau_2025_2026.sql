-- Adhésions 2025-2026 du bureau (test de l'expiration automatique au 1er sept.)
-- L'année scolaire court du 1er septembre au 31 août : une adhésion 2025-2026
-- est donc valide jusqu'au 31/08/2026 inclus.

insert into memberships (family_id, school_year, amount, paid_at)
select f.id, '2025-2026', 20.00, '2025-09-15T10:00:00+00'
from families f
on conflict (family_id, school_year) do update
  set amount = excluded.amount, paid_at = excluded.paid_at;

update families set status_current_year = 'adherent';
