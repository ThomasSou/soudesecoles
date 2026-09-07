import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import {
  televerserJustificatif,
  supprimerJustificatif,
  TYPES_JUSTIFICATIF,
} from "../../../../lib/comptaFichiers";
import { CLES_CLASSES, libelleClasse } from "../../../../lib/classesReference";
import { resoudreRepartition } from "../../../../lib/comptaRepartition";

export const dynamic = "force-dynamic";

const STATUTS = ["prevu", "a_verifier", "pointe", "a_valider"];
const COMPTES = ["courant", "placement"];

// Met à jour une ligne : statut (pointage), montant, libellé, fournisseur,
// date, compte bancaire, référence du relevé, note, et — pour une ligne
// « classe » — la liste des classes concernées.
//
// Les lignes venues d'une facture enseignant (source = 'enseignant') restent
// modifiables ici pour le pointage / la référence bancaire, mais leur
// libellé, montant et classes sont pilotés par la fiche enseignant : on ne
// les touche pas.
export async function PATCH(request, { params }) {
  const auth = await requirePermission(request, "comptabilite");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: ligne, error: eLecture } = await auth.admin
    .from("compta_lignes")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (eLecture) return NextResponse.json({ error: eLecture.message }, { status: 500 });
  if (!ligne) return NextResponse.json({ error: "Ligne introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  // --- Refuser une demande de remboursement (source 'benevole' seulement) ---
  if (body.refuserRemboursement) {
    if (!ligne.reimbursement_request_id) {
      return NextResponse.json(
        { error: "Cette ligne n'est pas rattachée à une demande de remboursement." },
        { status: 400 }
      );
    }
    const { error: eDemande } = await auth.admin
      .from("reimbursement_requests")
      .update({
        status: "refused",
        processed_at: new Date().toISOString(),
        processed_by: auth.parent.id,
      })
      .eq("id", ligne.reimbursement_request_id);
    if (eDemande) return NextResponse.json({ error: eDemande.message }, { status: 500 });
    // Demande refusée : la dépense ne compte pas, on retire la ligne.
    const { error: eDel } = await auth.admin.from("compta_lignes").delete().eq("id", params.id);
    if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // --- Marquer remboursé / annuler — pour toute ligne avancée par un
  //     bénévole (saisie bureau OU demande côté famille) ---
  if (body.rembourser || body.annulerRemboursement) {
    if (ligne.paye_par !== "benevole") {
      return NextResponse.json(
        { error: "Cette dépense n'a pas été avancée par un bénévole." },
        { status: 400 }
      );
    }
    const rembourse = Boolean(body.rembourser);
    const majLigne = {
      rembourse_le: rembourse ? new Date().toISOString() : null,
      rembourse_par: rembourse ? auth.parent.id : null,
    };
    // « Remboursé » implique « validé » : on sort la ligne de « à valider ».
    if (rembourse && ligne.statut === "a_valider") majLigne.statut = "a_verifier";
    const { error: eLigne } = await auth.admin
      .from("compta_lignes")
      .update(majLigne)
      .eq("id", params.id);
    if (eLigne) return NextResponse.json({ error: eLigne.message }, { status: 500 });

    // Reflet sur la fiche du bénévole quand il y a une demande liée.
    if (ligne.reimbursement_request_id) {
      await auth.admin
        .from("reimbursement_requests")
        .update({
          status: rembourse ? "reimbursed" : "pending",
          processed_at: rembourse ? new Date().toISOString() : null,
          processed_by: rembourse ? auth.parent.id : null,
        })
        .eq("id", ligne.reimbursement_request_id);
    }
    return NextResponse.json({ ok: true });
  }

  const update = {};
  const manuelle = ligne.source === "manuel";

  if (body.statut !== undefined) {
    if (!STATUTS.includes(body.statut)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }
    update.statut = body.statut;
    if (body.statut === "pointe") {
      update.pointe_le = new Date().toISOString();
      update.pointe_par = auth.parent.id;
    } else {
      update.pointe_le = null;
      update.pointe_par = null;
    }
  }

  if (body.compte !== undefined) {
    if (body.compte && !COMPTES.includes(body.compte)) {
      return NextResponse.json({ error: "Compte bancaire invalide." }, { status: 400 });
    }
    update.compte = body.compte || null;
  }
  if (body.refBancaire !== undefined) {
    update.ref_bancaire = body.refBancaire?.trim() || null;
  }
  if (body.dateOperation !== undefined) {
    update.date_operation = body.dateOperation || null;
  }
  if (body.note !== undefined) {
    update.note = body.note?.trim() || null;
  }

  // Justificatif : ajout / remplacement (toutes sources — le bureau peut
  // joindre sa propre facture même sur une ligne enseignant), reclassement
  // (devis -> facture définitive…) sans re-téléverser, ou retrait.
  const typeDemande = TYPES_JUSTIFICATIF.includes(body.justificatifType)
    ? body.justificatifType
    : null;

  if (body.justificatifDataUrl) {
    const { path, error: eFichier } = await televerserJustificatif(
      auth.admin,
      params.id,
      body.justificatifDataUrl
    );
    if (eFichier) return NextResponse.json({ error: eFichier }, { status: 400 });
    if (ligne.justificatif_path) await supprimerJustificatif(auth.admin, ligne.justificatif_path);
    update.justificatif_path = path;
    update.justificatif_type = typeDemande || "facture_definitive";
  } else if (body.retirerJustificatif && ligne.justificatif_path) {
    await supprimerJustificatif(auth.admin, ligne.justificatif_path);
    update.justificatif_path = null;
    update.justificatif_type = null;
  } else if (typeDemande && ligne.justificatif_path) {
    update.justificatif_type = typeDemande;
  }

  // Devis <-> dépense prévisionnelle. Un devis force le statut « prevu » ;
  // le remplacer par une facture (provisoire ou définitive) sort la ligne
  // du prévisionnel (sauf si elle est déjà pointée). On ne touche pas au
  // statut si le bureau l'a fixé explicitement dans la même requête.
  const typeFinal =
    update.justificatif_type !== undefined ? update.justificatif_type : ligne.justificatif_type;
  if (body.statut === undefined) {
    if (typeFinal === "devis" && ligne.statut !== "prevu") {
      update.statut = "prevu";
      update.pointe_le = null;
      update.pointe_par = null;
    } else if (
      (typeFinal === "facture_provisoire" || typeFinal === "facture_definitive") &&
      ligne.statut === "prevu"
    ) {
      update.statut = "a_verifier";
    }
  }

  // Manifestations d'une ligne « événement » manuelle : la colonne
  // evenement_id porte la 1re de la liste (contrainte de cohérence), la
  // liste complète est remplacée plus bas dans compta_ligne_evenements.
  const evenementsMaj =
    manuelle && ligne.rubrique === "evenement" && Array.isArray(body.evenements)
      ? [...new Set(body.evenements.map((e) => String(e).trim()).filter(Boolean))]
      : null;
  if (evenementsMaj) {
    if (evenementsMaj.length === 0) {
      return NextResponse.json(
        { error: "Choisissez au moins une manifestation." },
        { status: 400 }
      );
    }
    update.evenement_id = evenementsMaj[0];
  }

  // Champs réservés aux lignes manuelles.
  if (manuelle) {
    if (body.libelle !== undefined) {
      const v = body.libelle?.trim();
      if (!v) return NextResponse.json({ error: "Le libellé ne peut pas être vide." }, { status: 400 });
      update.libelle = v;
    }
    if (body.fournisseur !== undefined) {
      update.fournisseur = body.fournisseur?.trim() || null;
    }
    if (body.annee) {
      update.school_year = String(body.annee).trim();
    }
    // On n'écrit paye_par que si ça change vraiment quelque chose : évite de
    // toucher la colonne (donc de planter) tant que 0046 n'est pas passée
    // pour les lignes « le Sou ».
    if (body.payePar !== undefined) {
      const pp = body.payePar === "benevole" ? "benevole" : "sou";
      const ppId = pp === "benevole" ? body.payeParParentId || null : null;
      if (pp === "benevole" && !ppId) {
        return NextResponse.json(
          { error: "Choisissez le bénévole qui a avancé la dépense." },
          { status: 400 }
        );
      }
      const actuel = ligne.paye_par || "sou";
      if (pp !== actuel || (pp === "benevole" && ppId !== ligne.paye_par_parent_id)) {
        update.paye_par = pp;
        update.paye_par_parent_id = ppId;
      }
    }
    if (body.montant !== undefined) {
      const m = Number(String(body.montant ?? "").replace(",", "."));
      if (!Number.isFinite(m) || m <= 0) {
        return NextResponse.json({ error: "Le montant doit être supérieur à 0." }, { status: 400 });
      }
      update.montant_cents = Math.round(m * 100);
    }
  }

  // Classes d'une ligne « classe » manuelle à remplacer (le cas échéant).
  const classesMaj =
    manuelle && ligne.rubrique === "classe" && Array.isArray(body.classes)
      ? [...new Set(body.classes.map((c) => String(c).trim()).filter((c) => CLES_CLASSES.includes(c)))]
      : null;
  if (classesMaj && classesMaj.length === 0) {
    return NextResponse.json(
      { error: "Choisissez au moins une classe dans la liste." },
      { status: 400 }
    );
  }

  // Répartition (égale ou différenciée) — validée AVANT d'écrire quoi que
  // ce soit, pour ne pas laisser la ligne à moitié modifiée.
  const totalCents =
    update.montant_cents !== undefined ? update.montant_cents : ligne.montant_cents;
  let montantsClasses = null;
  let montantsEvenements = null;
  if (classesMaj) {
    const r = resoudreRepartition({
      cles: classesMaj,
      mode: body.repartitionClasses,
      montantsBruts: body.classesMontants,
      totalCents,
      libelle: libelleClasse,
    });
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    montantsClasses = r.montants;
  }
  if (evenementsMaj) {
    const r = resoudreRepartition({
      cles: evenementsMaj,
      mode: body.repartitionEvenements,
      montantsBruts: body.evenementsMontants,
      totalCents,
    });
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    montantsEvenements = r.montants;
  }

  if (Object.keys(update).length > 0) {
    const { error } = await auth.admin.from("compta_lignes").update(update).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // montant_cents ajouté seulement en répartition différenciée (compat 0044).
  const lienAvecMontant = (base, montants, cle) => {
    const row = { ...base };
    if (montants && montants[cle] != null) row.montant_cents = montants[cle];
    return row;
  };

  if (classesMaj) {
    await auth.admin.from("compta_ligne_classes").delete().eq("ligne_id", params.id);
    const { error } = await auth.admin.from("compta_ligne_classes").insert(
      classesMaj.map((class_label) =>
        lienAvecMontant({ ligne_id: params.id, class_label }, montantsClasses, class_label)
      )
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (evenementsMaj) {
    await auth.admin.from("compta_ligne_evenements").delete().eq("ligne_id", params.id);
    const { error } = await auth.admin.from("compta_ligne_evenements").insert(
      evenementsMaj.map((evenement_id) =>
        lienAvecMontant({ ligne_id: params.id, evenement_id }, montantsEvenements, evenement_id)
      )
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// Suppression : uniquement les lignes saisies à la main. Une ligne issue
// d'une facture enseignant se pilote depuis la fiche enseignant.
export async function DELETE(request, { params }) {
  const auth = await requirePermission(request, "comptabilite");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: ligne } = await auth.admin
    .from("compta_lignes")
    .select("id, source")
    .eq("id", params.id)
    .maybeSingle();
  if (!ligne) return NextResponse.json({ error: "Ligne introuvable." }, { status: 404 });
  if (ligne.source !== "manuel") {
    return NextResponse.json(
      { error: "Cette ligne vient d'une facture enseignant : elle se gère depuis l'onglet Enseignants." },
      { status: 400 }
    );
  }

  const { error } = await auth.admin.from("compta_lignes").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
