import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

const STATUSES = ["soumis", "valide", "refuse"];

// Décision du bureau sur un devis : le valider, le refuser, ou le remettre en
// attente ; et/ou modifier la note interne. C'est ce changement qui fait
// apparaître « Validé » ou « Refusé » côté enseignant — jamais avant.
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, "enseignants");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const status = body?.status;
  const adminNote = body?.adminNote?.trim() || null;

  if (status && !STATUSES.includes(status)) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
  }

  const update = { admin_note: adminNote };
  if (status) {
    update.status = status;
    update.decided_at = status === "soumis" ? null : new Date().toISOString();
    update.decided_by = status === "soumis" ? null : auth.parent.id;
  }

  const { error } = await auth.admin.from("teacher_quotes").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
