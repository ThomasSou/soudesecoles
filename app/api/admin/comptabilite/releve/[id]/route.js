import { NextResponse } from "next/server";
import { requirePermission } from "../../../../../lib/adminAuth";
import { currentSchoolYear } from "../../../../../lib/anneeScolaire";
import { tiersProbable } from "../../../../../lib/releveCA";
import {
  appliquerModele,
  appliquerPointage,
  chargerModeles,
  detacher,
  signatureOperation,
  sommeLiens,
} from "../../../../../lib/comptaPointage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const RUBRIQUES_REPARTITION = ["evenement", "investissement", "courant"];
const MAX_PARTS = 30;

const euros = (cents) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

// Actions sur une opération du relevé :
//   { action: "pointer", ligneId }   rapproche l'opération d'une ligne de compta
//                                    (qui peut n'en couvrir qu'une part)
//   { action: "repartir", parts }    crée d'un coup plusieurs lignes (une par
//                                    part : manifestation, investissement,
//                                    fonctionnement) et les rapproche
//   { action: "detacher", ligneId }  retire UNE ligne de l'opération
//   { action: "ignorer", note }      l'écarte de la compta (virement interne...)
//   { action: "rouvrir" }            annule le pointage ou la mise à l'écart
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, "comptabilite");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const { data: op, error: eLecture } = await auth.admin
    .from("compta_operations")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (eLecture) return NextResponse.json({ error: eLecture.message }, { status: 500 });
  if (!op) return NextResponse.json({ error: "Opération introuvable." }, { status: 404 });

  const { data: liens, error: eLiens } = await auth.admin
    .from("compta_operation_lignes")
    .select("ligne_id, montant_cents")
    .eq("operation_id", op.id);
  if (eLiens) {
    const absente = /compta_operation_lignes/.test(eLiens.message || "");
    return NextResponse.json(
      { error: absente ? "La migration 0055 doit d'abord être lancée dans Supabase." : eLiens.message },
      { status: absente ? 409 : 500 }
    );
  }
  const reste = op.montant_cents - sommeLiens(liens);

  if (body.action === "pointer") {
    if (op.statut === "ignoree") {
      return NextResponse.json({ error: "Cette opération est écartée : remettez-la d'abord à pointer." }, { status: 400 });
    }
    if (reste <= 0) {
      return NextResponse.json({ error: "Cette opération est déjà entièrement pointée." }, { status: 400 });
    }
    const { data: ligne } = await auth.admin
      .from("compta_lignes")
      .select("*")
      .eq("id", body.ligneId || "")
      .maybeSingle();
    if (!ligne) return NextResponse.json({ error: "Ligne de comptabilité introuvable." }, { status: 404 });
    if (ligne.sens !== op.sens) {
      return NextResponse.json(
        { error: "Une dépense ne peut pas être pointée avec une recette (ni l'inverse)." },
        { status: 400 }
      );
    }
    const r = await appliquerPointage(auth.admin, op, ligne, auth.parent.id, "manuel");
    if (r.error) return NextResponse.json({ error: r.error }, { status: 409 });
    return NextResponse.json({ ok: true, complete: r.complete });
  }

  if (body.action === "repartir") {
    if (op.statut === "ignoree") {
      return NextResponse.json({ error: "Cette opération est écartée : remettez-la d'abord à pointer." }, { status: 400 });
    }
    const parts = Array.isArray(body.parts) ? body.parts : [];
    if (parts.length === 0 || parts.length > MAX_PARTS) {
      return NextResponse.json({ error: `Indiquez entre 1 et ${MAX_PARTS} parts.` }, { status: 400 });
    }

    // Validation de toutes les parts AVANT de créer quoi que ce soit.
    const nettoyees = [];
    for (const [i, p] of parts.entries()) {
      const n = i + 1;
      const montant = Number(p.montantCents);
      const libelle = String(p.libelle || "").trim().slice(0, 200);
      if (!RUBRIQUES_REPARTITION.includes(p.rubrique)) {
        return NextResponse.json({ error: `Part ${n} : choisissez une rubrique.` }, { status: 400 });
      }
      if (!Number.isInteger(montant) || montant <= 0) {
        return NextResponse.json({ error: `Part ${n} : le montant doit être supérieur à 0.` }, { status: 400 });
      }
      if (!libelle) {
        return NextResponse.json({ error: `Part ${n} : donnez un libellé.` }, { status: 400 });
      }
      if (p.rubrique === "evenement" && !p.evenementId) {
        return NextResponse.json({ error: `Part ${n} : choisissez la manifestation.` }, { status: 400 });
      }
      const annee = /^\d{4}-\d{4}$/.test(p.annee || "") ? p.annee : currentSchoolYear();
      nettoyees.push({
        rubrique: p.rubrique,
        evenementId: p.rubrique === "evenement" ? String(p.evenementId) : null,
        libelle,
        fournisseur: String(p.fournisseur || "").trim().slice(0, 120) || tiersProbable(op) || "Divers",
        montant,
        annee,
      });
    }
    const total = nettoyees.reduce((s, p) => s + p.montant, 0);
    if (total > reste) {
      return NextResponse.json(
        { error: `Les parts (${euros(total)}) dépassent ce qui reste à répartir (${euros(reste)}).` },
        { status: 400 }
      );
    }
    const idsEvenements = [...new Set(nettoyees.map((p) => p.evenementId).filter(Boolean))];
    if (idsEvenements.length) {
      const { data: evts } = await auth.admin.from("benevolat_evenements").select("id").in("id", idsEvenements);
      if ((evts || []).length !== idsEvenements.length) {
        return NextResponse.json({ error: "Une manifestation choisie n'existe plus." }, { status: 400 });
      }
    }

    // Création des lignes, puis rapprochement de chacune. En cas d'échec en
    // cours de route, tout ce qui vient d'être créé est retiré.
    const creees = [];
    const annuler = async () => {
      for (const l of creees) {
        await auth.admin.from("compta_operation_lignes").delete().eq("ligne_id", l.id);
        await auth.admin.from("compta_lignes").delete().eq("id", l.id);
      }
      if (creees.length) {
        await auth.admin
          .from("compta_operations")
          .update({ statut: "a_pointer", mode_pointage: null, pointee_le: null, pointee_par: null })
          .eq("id", op.id);
      }
    };
    for (const p of nettoyees) {
      const { data: ligne, error } = await auth.admin
        .from("compta_lignes")
        .insert({
          sens: op.sens,
          rubrique: p.rubrique,
          evenement_id: p.evenementId,
          libelle: p.libelle,
          fournisseur: p.fournisseur,
          montant_cents: p.montant,
          date_operation: op.date_operation,
          statut: "a_verifier",
          source: "manuel",
          compte: op.compte,
          school_year: p.annee,
          created_by: auth.parent.id,
        })
        .select("*")
        .single();
      if (error) {
        await annuler();
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      creees.push(ligne);
      if (p.evenementId) {
        const { error: eEv } = await auth.admin
          .from("compta_ligne_evenements")
          .insert({ ligne_id: ligne.id, evenement_id: p.evenementId });
        if (eEv) {
          await annuler();
          return NextResponse.json({ error: eEv.message }, { status: 500 });
        }
      }
      const r = await appliquerPointage(auth.admin, op, ligne, auth.parent.id, "manuel");
      if (r.error) {
        await annuler();
        return NextResponse.json({ error: r.error }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true, creees: creees.length, reste: reste - total });
  }

  // Classer comme la fois précédente (modèle appris de l'historique).
  if (body.action === "modele") {
    if (op.statut === "ignoree" || liens.length > 0) {
      return NextResponse.json({ error: "Cette opération est déjà traitée." }, { status: 400 });
    }
    const sig = signatureOperation(op);
    const modele = sig ? (await chargerModeles(auth.admin)).get(sig) : null;
    if (!modele) {
      return NextResponse.json({ error: "Aucun classement précédent identique pour cette opération." }, { status: 404 });
    }
    const r = await appliquerModele(auth.admin, op, modele, auth.parent.id, "manuel");
    if (r.error) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "detacher") {
    if (!body.ligneId || !liens.some((l) => l.ligne_id === body.ligneId)) {
      return NextResponse.json({ error: "Cette ligne n'est pas rattachée à l'opération." }, { status: 400 });
    }
    const r = await detacher(auth.admin, op, body.ligneId);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "ignorer") {
    if (liens.length > 0) {
      return NextResponse.json(
        { error: "Cette opération a déjà des lignes rattachées : annulez d'abord leur pointage." },
        { status: 400 }
      );
    }
    const { error } = await auth.admin
      .from("compta_operations")
      .update({
        statut: "ignoree",
        note: String(body.note || "").trim().slice(0, 300) || null,
        mode_pointage: null,
        pointee_le: new Date().toISOString(),
        pointee_par: auth.parent.id,
      })
      .eq("id", op.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "rouvrir") {
    const r = await detacher(auth.admin, op, null);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
