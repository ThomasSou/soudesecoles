import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";
import { BUCKET } from "../../../../../lib/enseignantFichiers";

export const dynamic = "force-dynamic";

const STATUSES = ["soumise", "remboursee"];

// Purge du RIB au remboursement (décision D8). Une fois le virement fait, le
// bénéficiaire est enregistré côté banque : le RIB ne sert plus et ne doit
// pas traîner. On supprime le fichier du bucket privé et on ne garde qu'une
// trace booléenne (`rib_received`) sur la facture.
//   - RIB joint directement à la facture (`rib_file_path`) → supprimé, colonne
//     remise à NULL.
//   - RIB réutilisable (`rib_id` → teacher_ribs) → supprimé UNIQUEMENT si plus
//     aucune autre facture non remboursée ne le référence ; la ligne
//     teacher_ribs est conservée (rib_file_path = NULL, purged_at horodaté).
async function purgerRib(admin, facture) {
  const aSupprimer = [];

  if (facture.rib_file_path) {
    aSupprimer.push(facture.rib_file_path);
    await admin
      .from("teacher_invoices")
      .update({ rib_file_path: null })
      .eq("id", facture.id);
  }

  if (facture.rib_id) {
    const { data: autres } = await admin
      .from("teacher_invoices")
      .select("id")
      .eq("rib_id", facture.rib_id)
      .neq("id", facture.id)
      .neq("status", "remboursee");

    if (!autres || autres.length === 0) {
      const { data: rib } = await admin
        .from("teacher_ribs")
        .select("rib_file_path")
        .eq("id", facture.rib_id)
        .maybeSingle();
      if (rib?.rib_file_path) {
        aSupprimer.push(rib.rib_file_path);
        await admin
          .from("teacher_ribs")
          .update({ rib_file_path: null, purged_at: new Date().toISOString() })
          .eq("id", facture.rib_id);
      }
    }
  }

  if (aSupprimer.length > 0) {
    await admin.storage.from(BUCKET).remove(aSupprimer);
  }
}

// Le bureau marque une facture « remboursée » (le virement lui-même reste
// manuel : ce statut ne fait que suivre l'état) ou la remet en « soumise » ;
// et/ou modifie la note interne.
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, "enseignants");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const status = body?.status;
  const adminNote = body?.adminNote?.trim() || null;

  if (status && !STATUSES.includes(status)) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
  }

  const { data: facture, error: lectureError } = await auth.admin
    .from("teacher_invoices")
    .select("id, status, rib_id, rib_file_path, rib_received")
    .eq("id", params.id)
    .maybeSingle();

  if (lectureError || !facture) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }

  const update = { admin_note: adminNote };
  if (status) {
    update.status = status;
    update.reimbursed_at = status === "remboursee" ? new Date().toISOString() : null;
    update.reimbursed_by = status === "remboursee" ? auth.parent.id : null;
    // On mémorise qu'un RIB a bien existé, AVANT de le purger.
    if (status === "remboursee" && (facture.rib_id || facture.rib_file_path)) {
      update.rib_received = true;
    }
  }

  const { error } = await auth.admin
    .from("teacher_invoices")
    .update(update)
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Purge après la mise à jour du statut : si la suppression de fichier
  // échoue, la facture est quand même passée à « remboursée » (le fichier
  // pourra être nettoyé plus tard) — on ne bloque pas le suivi comptable.
  if (status === "remboursee" && facture.status !== "remboursee") {
    try {
      await purgerRib(auth.admin, facture);
    } catch (e) {
      return NextResponse.json({
        ok: true,
        avertissement:
          "Facture marquée remboursée, mais la suppression automatique du RIB a échoué : " +
          (e?.message || "erreur inconnue"),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
