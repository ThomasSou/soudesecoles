import { NextResponse } from "next/server";
import { requireComptaEvenements } from "../../../../../lib/adminAuth";
import { chargerLigneAutorisee } from "../../../../../lib/comptaEvenement";
import { urlSignee } from "../../../../../lib/comptaFichiers";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// URL signée (5 minutes) vers le justificatif d'une ligne d'une manifestation
// accordée à la personne.
export async function GET(request, { params }) {
  const auth = await requireComptaEvenements(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const acces = await chargerLigneAutorisee(auth, params.id);
  if (acces.error) return NextResponse.json({ error: acces.error }, { status: acces.status });

  if (!acces.ligne.justificatif_path) {
    return NextResponse.json({ error: "Aucun justificatif pour cette ligne." }, { status: 404 });
  }
  const { url, error } = await urlSignee(auth.admin, acces.ligne.justificatif_path);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true, url });
}
