// Planning des créneaux bénévoles d'un événement, avec le nombre de places
// restantes calculé à l'instant de l'appel. Utilisé par l'éditeur d'e-mails
// pour insérer, au moment de l'envoi, un récapitulatif « il reste X places
// sur Y » cliquable vers la page publique (cf. app/lib/emailBlocks.js et
// app/lib/emailCampagne.js). Même logique que /api/benevoles/planning, mais
// pour un seul événement.
export async function chargerPlanningEvenement(admin, evenementId) {
  if (!evenementId) return null;

  const { data: evenement } = await admin
    .from("benevolat_evenements")
    .select("id, nom")
    .eq("id", evenementId)
    .maybeSingle();
  if (!evenement) return null;

  const { data: ateliers } = await admin
    .from("benevolat_ateliers")
    .select("id, nom, position")
    .eq("evenement_id", evenementId)
    .order("position");

  const atelierIds = (ateliers || []).map((a) => a.id);
  if (atelierIds.length === 0) {
    return { nom: evenement.nom, ateliers: [] };
  }

  const { data: creneaux } = await admin
    .from("benevolat_creneaux")
    .select("id, atelier_id, debut, fin, places, nom")
    .in("atelier_id", atelierIds)
    .order("debut");

  const creneauIds = (creneaux || []).map((c) => c.id);
  const inscritsParCreneau = {};
  if (creneauIds.length > 0) {
    const { data: inscriptions } = await admin
      .from("benevolat_inscriptions")
      .select("creneau_id")
      .in("creneau_id", creneauIds);
    for (const i of inscriptions || []) {
      inscritsParCreneau[i.creneau_id] = (inscritsParCreneau[i.creneau_id] || 0) + 1;
    }
  }

  const creneauxParAtelier = {};
  for (const c of creneaux || []) {
    (creneauxParAtelier[c.atelier_id] = creneauxParAtelier[c.atelier_id] || []).push({
      nom: c.nom,
      debut: c.debut,
      fin: c.fin,
      places: c.places,
      placesRestantes: Math.max(0, c.places - (inscritsParCreneau[c.id] || 0)),
    });
  }

  return {
    nom: evenement.nom,
    ateliers: (ateliers || [])
      .map((a) => ({ nom: a.nom, creneaux: creneauxParAtelier[a.id] || [] }))
      .filter((a) => a.creneaux.length > 0),
  };
}

// Version bornée dans le temps de chargerPlanningEvenement, à utiliser dans
// le parcours d'envoi (test + campagnes) : si le calcul du planning n'aboutit
// pas (base lente ou indisponible, requête qui pend), on renvoie null au bout
// de `msMax` et l'e-mail part sans le tableau des créneaux — plutôt que de
// bloquer toute la fonction serveur jusqu'au time-out de Netlify, ce qui
// faisait échouer l'envoi entier sans message clair.
export async function chargerPlanningEvenementBorne(admin, evenementId, msMax = 6000) {
  if (!evenementId) return null;

  let minuteur;
  const expiration = new Promise((resolve) => {
    minuteur = setTimeout(() => resolve({ __expire: true }), msMax);
  });

  try {
    const resultat = await Promise.race([
      chargerPlanningEvenement(admin, evenementId),
      expiration,
    ]);
    if (resultat && resultat.__expire) {
      console.warn(`chargerPlanningEvenement : délai de ${msMax} ms dépassé, planning omis.`);
      return null;
    }
    return resultat;
  } catch (error) {
    console.warn("chargerPlanningEvenement a échoué, planning omis :", error?.message);
    return null;
  } finally {
    clearTimeout(minuteur);
  }
}
