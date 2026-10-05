import { NextResponse } from "next/server";
import { requireComptaEvenements } from "../../../../lib/adminAuth";
import { chargerLigneAutorisee } from "../../../../lib/comptaEvenement";
import {
  televerserJustificatif,
  supprimerJustificatif,
  TYPES_JUSTIFICATIF,
} from "../../../../lib/comptaFichiers";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Corrige sa propre ligne tant que le bureau ne l'a pas validée.
export async function PATCH(request, { params }) {
  const auth = await requireComptaEvenements(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const acces = await chargerLigneAutorisee(auth, params.id, { ecriture: true });
  if (acces.error) return NextResponse.json({ error: acces.error }, { status: acces.status });
  const { ligne } = acces;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const maj = {};
  if (body.libelle !== undefined) {
    const libelle = String(body.libelle).trim();
    if (!libelle) return NextResponse.json({ error: "Le libellé est obligatoire." }, { status: 400 });
    maj.libelle = libelle;
  }
  if (body.fournisseur !== undefined) {
    const fournisseur = String(body.fournisseur).trim();
    if (!fournisseur) return NextResponse.json({ error: "Le fournisseur est obligatoire." }, { status: 400 });
    maj.fournisseur = fournisseur;
  }
  if (body.montant !== undefined) {
    const montant = Number(String(body.montant).replace(",", "."));
    if (!Number.isFinite(montant) || montant <= 0) {
      return NextResponse.json({ error: "Le montant doit être supérieur à 0." }, { status: 400 });
    }
    maj.montant_cents = Math.round(montant * 100);
  }
  if (body.dateOperation !== undefined) {
    if (!body.dateOperation && ligne.statut !== "prevu") {
      return NextResponse.json({ error: "La date est obligatoire." }, { status: 400 });
    }
    maj.date_operation = body.dateOperation || null;
  }
  if (body.note !== undefined) maj.note = String(body.note).trim() || null;

  if (body.justificatifDataUrl) {
    const type = TYPES_JUSTIFICATIF.includes(body.justificatifType)
      ? body.justificatifType
      : "facture_definitive";
    const { path, error: eFichier } = await televerserJustificatif(auth.admin, ligne.id, body.justificatifDataUrl);
    if (eFichier) return NextResponse.json({ error: eFichier }, { status: 400 });
    await supprimerJustificatif(auth.admin, ligne.justificatif_path);
    maj.justificatif_path = path;
    maj.justificatif_type = type;
    // Un devis reste prévisionnel ; une vraie facture le fait passer « à valider ».
    maj.statut = type === "devis" ? "prevu" : "a_valider";
  }

  if (Object.keys(maj).length === 0) {
    return NextResponse.json({ error: "Rien à modifier." }, { status: 400 });
  }

  const { error } = await auth.admin.from("compta_lignes").update(maj).eq("id", ligne.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Supprime sa propre ligne tant que le bureau ne l'a pas validée (ex. une
// facture saisie par erreur).
export async function DELETE(request, { params }) {
  const auth = await requireComptaEvenements(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const acces = await chargerLigneAutorisee(auth, params.id, { ecriture: true });
  if (acces.error) return NextResponse.json({ error: acces.error }, { status: acces.status });

  await supprimerJustificatif(auth.admin, acces.ligne.justificatif_path);
  const { error } = await auth.admin.from("compta_lignes").delete().eq("id", acces.ligne.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
