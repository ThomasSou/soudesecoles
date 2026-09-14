import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";

export const dynamic = "force-dynamic";
// "force-dynamic" empêche Next.js de mettre en cache CETTE route, mais ne
// désactive pas forcément le cache interne ("Data Cache") qu'il applique à
// TOUT appel fetch() exécuté pendant son traitement — y compris ceux que le
// client Supabase fait lui-même en coulisses vers PostgREST. Ce cache vit
// dans le processus serveur : une valeur mise en cache peut donc rester
// fausse indéfiniment tant que ce processus ne redémarre pas (constaté :
// un statut modifié ne réapparaissait jamais correctement, même après
// plusieurs minutes de rechargements manuels, jusqu'au prochain déploiement
// qui recrée les fonctions serveur). "force-no-store" coupe ce cache pour
// toute la route, pas seulement pour sa propre réponse HTTP.
export const fetchCache = "force-no-store";

// En complément, on empêche aussi explicitement toute mise en cache de la
// réponse HTTP elle-même (navigateur/CDN) — sans lien avec le problème
// ci-dessus, mais par prudence.
const NO_STORE = {
  headers: {
    "Cache-Control": "no-store",
    "Netlify-CDN-Cache-Control": "no-store",
  },
};

// Liste de toutes les demandes de remboursement, la plus récente d'abord,
// avec le nom de la famille et du parent pour l'affichage back-office.
export async function GET(request) {
  const auth = await requirePermission(request, "remboursements");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status, ...NO_STORE });

  const { data, error } = await auth.admin
    .from("reimbursement_requests")
    .select(
      "id, family_id, parent_id, category, event_name, description, supplier_name, amount_cents, invoice_path, rib_path, status, admin_note, created_at, processed_at"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500, ...NO_STORE });

  // Dépenses saisies directement en comptabilité et attribuées à un·e
  // bénévole (« payé par un bénévole ») : elles n'ont pas de demande déposée
  // par la famille (pas de ligne dans reimbursement_requests) mais doivent
  // quand même apparaître ici, sinon le bureau perd leur trace de ce côté.
  // Même logique que côté famille (api/remboursements), en lecture seule :
  // leur remboursement se marque depuis la Comptabilité, pas ici.
  const { data: avancesBureau } = await auth.admin
    .from("compta_lignes")
    .select("id, libelle, fournisseur, montant_cents, rembourse_le, created_at, rubrique, paye_par_parent_id")
    .eq("source", "manuel")
    .eq("paye_par", "benevole")
    .order("created_at", { ascending: false });

  const CAT_PAR_RUBRIQUE = {
    evenement: "manifestation",
    investissement: "investissement",
    courant: "fonctionnement",
    classe: "autre",
  };
  const avances = (avancesBureau || []).map((l) => ({
    id: `compta-${l.id}`,
    parent_id: l.paye_par_parent_id,
    category: CAT_PAR_RUBRIQUE[l.rubrique] || "autre",
    event_name: null,
    description: l.libelle,
    supplier_name: l.fournisseur,
    amount_cents: l.montant_cents,
    invoice_path: null,
    rib_path: null,
    status: l.rembourse_le ? "reimbursed" : "pending",
    admin_note: null,
    created_at: l.created_at,
    processed_at: l.rembourse_le,
    origine: "bureau",
  }));

  const parentIds = [
    ...new Set([...(data || []).map((d) => d.parent_id), ...avances.map((d) => d.parent_id)].filter(Boolean)),
  ];
  const { data: parents } = parentIds.length
    ? await auth.admin.from("parents").select("id, first_name, last_name, email").in("id", parentIds)
    : { data: [] };
  const parentsById = Object.fromEntries((parents || []).map((p) => [p.id, p]));

  const demandes = [...(data || []), ...avances]
    .map((d) => ({
      ...d,
      parent: parentsById[d.parent_id] || null,
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return NextResponse.json({ ok: true, demandes }, NO_STORE);
}
