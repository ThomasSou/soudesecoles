// Contrôle d'accès à UNE ligne de compta pour la saisie limitée à certaines
// manifestations (cf. requireComptaEvenements dans adminAuth.js).
//
// - lecture (justificatif) : la ligne doit concerner au moins une
//   manifestation accordée à la personne ;
// - modification / suppression (`ecriture: true`) : en plus, c'est SA ligne,
//   encore « à valider » (ou prévisionnelle), saisie à la main, et elle ne
//   concerne que des manifestations accordées. Une fois validée par le
//   bureau, elle n'est plus modifiable ici.
// Le droit complet « comptabilite » (evenementIds = null) passe partout.
export async function chargerLigneAutorisee(auth, ligneId, { ecriture = false } = {}) {
  const { data: ligne } = await auth.admin
    .from("compta_lignes")
    .select("*")
    .eq("id", ligneId)
    .maybeSingle();
  if (!ligne || ligne.rubrique !== "evenement") {
    return { error: "Ligne introuvable.", status: 404 };
  }

  const { data: liens } = await auth.admin
    .from("compta_ligne_evenements")
    .select("evenement_id")
    .eq("ligne_id", ligneId);
  const ids = (liens || []).map((l) => l.evenement_id);

  if (auth.evenementIds) {
    const autorises = new Set(auth.evenementIds);
    if (!ids.some((id) => autorises.has(id))) {
      return { error: "Ligne introuvable.", status: 404 };
    }
    if (ecriture) {
      const modifiable =
        ligne.created_by === auth.parent.id &&
        ligne.source === "manuel" &&
        (ligne.statut === "a_valider" || ligne.statut === "prevu") &&
        ids.every((id) => autorises.has(id));
      if (!modifiable) {
        return {
          error: "Cette ligne a déjà été validée par le bureau ou n'est pas la vôtre : elle n'est plus modifiable ici.",
          status: 403,
        };
      }
    }
  }
  return { ligne, ids };
}
