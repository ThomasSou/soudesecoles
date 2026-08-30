// Dépôt des fichiers de l'espace enseignant (devis, factures, RIB) dans le
// bucket privé `remboursements` qui EXISTE DÉJÀ (créé par la migration 0024
// pour les demandes de remboursement des parents). On ne crée pas de nouveau
// bucket : on range les fichiers enseignants sous un préfixe dédié.
//
// Même logique que app/api/remboursements/route.js : le navigateur envoie le
// fichier en Data URL base64, on le décode ici, on refuse au-delà de 8 Mo et
// hors image/PDF, et on renvoie un chemin de stockage. Le bucket étant privé,
// la seule façon de relire un fichier ensuite est une URL signée de courte
// durée, générée côté serveur pour le bureau (cf. routes /fichier).

export const BUCKET = "remboursements";
export const PREFIXE = "enseignants";
const MAX_BYTES = 8 * 1024 * 1024; // 8 Mo (devis/factures scannés, RIB)

export function decoderDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9+.-]+|application\/pdf);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0 || buffer.length > MAX_BYTES) return null;
  const ext =
    contentType === "application/pdf"
      ? "pdf"
      : contentType.split("/")[1].replace("jpeg", "jpg");
  return { contentType, buffer, ext };
}

// Charge un fichier et renvoie son chemin dans le bucket. `kind` sert
// seulement à nommer le fichier de façon lisible (devis / facture / rib).
export async function televerserFichier(admin, { teacherId, kind, dataUrl }) {
  const fichier = decoderDataUrl(dataUrl);
  if (!fichier) {
    return { path: null, error: "Fichier invalide ou trop lourd (image ou PDF, 8 Mo maximum)." };
  }
  const nom = `${Date.now()}-${Math.round(Math.random() * 1e6)}-${kind}.${fichier.ext}`;
  const path = `${PREFIXE}/${teacherId}/${nom}`;

  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, fichier.buffer, { contentType: fichier.contentType, upsert: false });

  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

// URL signée (5 minutes) vers un fichier du bucket privé — utilisée par le
// back-office pour consulter un devis, une facture ou un RIB.
export async function urlSignee(admin, path, secondes = 300) {
  if (!path) return { url: null, error: "Aucun fichier." };
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, secondes);
  if (error) return { url: null, error: error.message };
  return { url: data.signedUrl, error: null };
}
