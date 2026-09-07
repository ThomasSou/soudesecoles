// Justificatif (facture PDF ou image) attaché à une ligne de comptabilité.
// Même bucket privé et même contrôle de type/taille que l'espace enseignant
// (cf. app/lib/enseignantFichiers.js) : on réutilise son décodeur et son
// générateur d'URL signée, on change juste le préfixe de rangement.

import { decoderDataUrl, BUCKET, urlSignee } from "./enseignantFichiers";

export const PREFIXE_COMPTA = "comptabilite";

// Charge le justificatif d'une ligne et renvoie son chemin dans le bucket.
export async function televerserJustificatif(admin, ligneId, dataUrl) {
  const fichier = decoderDataUrl(dataUrl);
  if (!fichier) {
    return {
      path: null,
      error: "Justificatif invalide ou trop lourd (image ou PDF, 8 Mo maximum).",
    };
  }
  const nom = `${Date.now()}-${Math.round(Math.random() * 1e6)}-justificatif.${fichier.ext}`;
  const path = `${PREFIXE_COMPTA}/${ligneId}/${nom}`;

  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, fichier.buffer, { contentType: fichier.contentType, upsert: false });

  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

// Supprime le fichier du bucket (au remplacement ou au retrait). Sans effet
// si le chemin est vide ou si la suppression échoue — on ne bloque pas.
export async function supprimerJustificatif(admin, path) {
  if (!path) return;
  try {
    await admin.storage.from(BUCKET).remove([path]);
  } catch {
    /* nettoyage best-effort */
  }
}

export { urlSignee };
