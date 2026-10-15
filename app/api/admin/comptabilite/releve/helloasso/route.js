import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";
import { analyserAttestation, partsDepuisAttestation } from "../../../../../lib/helloassoAttestation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const TAILLE_MAX = 5 * 1024 * 1024;

// Lit l'attestation de versement HelloAsso (PDF, ou son texte collé) et
// propose la répartition du virement par campagne : une part par ligne
// (ventes, cotisations, dons), rattachée à la manifestation quand le nom de la
// campagne la désigne. Rien n'est enregistré ici : le bureau relit les parts
// dans la grille de répartition, puis valide.
export async function POST(request) {
  const auth = await requirePermission(request, "comptabilite");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body?.operationId) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const { data: op } = await auth.admin
    .from("compta_operations")
    .select("*")
    .eq("id", body.operationId)
    .maybeSingle();
  if (!op) return NextResponse.json({ error: "Opération introuvable." }, { status: 404 });
  if (op.sens !== "recette") {
    return NextResponse.json({ error: "Une attestation HelloAsso se rapporte à une recette." }, { status: 400 });
  }

  let texte = typeof body.texte === "string" ? body.texte : "";
  if (!texte && typeof body.pdf === "string") {
    const m = body.pdf.match(/^data:[^;,]*;base64,(.+)$/s);
    if (!m) return NextResponse.json({ error: "Fichier illisible." }, { status: 400 });
    const octets = Buffer.from(m[1], "base64");
    if (octets.length > TAILLE_MAX) {
      return NextResponse.json({ error: "Fichier trop volumineux (5 Mo maximum)." }, { status: 400 });
    }
    try {
      // Import dynamique du module de lecture seul (et non de son index, qui
      // lit un fichier de test quand il est empaqueté).
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      texte = (await pdfParse(octets)).text;
    } catch {
      return NextResponse.json(
        { error: "Lecture du PDF impossible. Ouvrez-le, copiez tout le texte (Ctrl+A puis Ctrl+C) et collez-le dans la case prévue." },
        { status: 422 }
      );
    }
  }
  if (!texte.trim()) return NextResponse.json({ error: "Aucun texte à lire." }, { status: 400 });

  const attestation = analyserAttestation(texte);
  if (attestation.erreur) return NextResponse.json({ error: attestation.erreur }, { status: 422 });

  if (attestation.montantCents !== op.montant_cents) {
    const e = (c) => `${(c / 100).toFixed(2).replace(".", ",")} €`;
    return NextResponse.json(
      {
        error: `Cette attestation (versement n°${attestation.numero || "?"}, ${e(attestation.montantCents)}) ne correspond pas à cette opération (${e(op.montant_cents)}).`,
      },
      { status: 422 }
    );
  }

  const { data: evenements } = await auth.admin.from("benevolat_evenements").select("id, nom");
  return NextResponse.json({
    numero: attestation.numero,
    date: attestation.date,
    parts: partsDepuisAttestation(attestation, evenements || [], op.date_operation),
  });
}
