import { NextResponse } from "next/server";
import { requireEnseignant } from "../../../lib/enseignantAuth";
import { urlSignee } from "../../../lib/enseignantFichiers";

export const dynamic = "force-dynamic";

// Décision D6 : un enseignant peut re-consulter SES propres pièces (devis,
// facture, RIB). Vérification stricte de propriété (la ligne doit appartenir
// à l'enseignant du jeton, jamais à un identifiant envoyé par le client),
// puis URL signée valable 5 minutes vers le bucket privé.
//
// Paramètres :
//   ?kind=devis&id=<uuid>
//   ?kind=facture&id=<uuid>[&partie=facture|rib]   (partie=facture par défaut)
//   ?kind=rib&id=<uuid>
export async function GET(request) {
  const auth = await requireEnseignant(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id");
  const partie = url.searchParams.get("partie") === "rib" ? "rib" : "facture";

  if (!id) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });

  let path = null;

  if (kind === "devis") {
    const { data } = await auth.admin
      .from("teacher_quotes")
      .select("quote_file_path, teacher_id")
      .eq("id", id)
      .maybeSingle();
    if (!data || data.teacher_id !== auth.teacher.id) {
      return NextResponse.json({ error: "Devis introuvable." }, { status: 404 });
    }
    path = data.quote_file_path;
  } else if (kind === "facture") {
    const { data } = await auth.admin
      .from("teacher_invoices")
      .select("invoice_file_path, rib_file_path, rib_id, rib_received, status, teacher_id")
      .eq("id", id)
      .maybeSingle();
    if (!data || data.teacher_id !== auth.teacher.id) {
      return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
    }
    if (partie === "facture") {
      path = data.invoice_file_path;
    } else {
      path = data.rib_file_path;
      if (!path && data.rib_id) {
        const { data: rib } = await auth.admin
          .from("teacher_ribs")
          .select("rib_file_path")
          .eq("id", data.rib_id)
          .maybeSingle();
        path = rib?.rib_file_path || null;
      }
      if (!path) {
        // Purgé au remboursement (D8) ou jamais fourni.
        const raison = data.rib_received
          ? "Le RIB a été supprimé après le remboursement de cette facture."
          : "Aucun RIB n'est associé à cette facture.";
        return NextResponse.json({ error: raison }, { status: 404 });
      }
    }
  } else if (kind === "rib") {
    const { data } = await auth.admin
      .from("teacher_ribs")
      .select("rib_file_path, purged_at, teacher_id")
      .eq("id", id)
      .maybeSingle();
    if (!data || data.teacher_id !== auth.teacher.id) {
      return NextResponse.json({ error: "RIB introuvable." }, { status: 404 });
    }
    if (!data.rib_file_path) {
      return NextResponse.json(
        { error: "Ce RIB a été supprimé après remboursement." },
        { status: 404 }
      );
    }
    path = data.rib_file_path;
  } else {
    return NextResponse.json({ error: "Type de fichier inconnu." }, { status: 400 });
  }

  const { url: signedUrl, error } = await urlSignee(auth.admin, path);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true, url: signedUrl });
}
