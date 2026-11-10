// Télécharge un fichier protégé : l'adresse exige le jeton de connexion dans
// l'en-tête (un simple lien ne le transmettrait pas), donc on récupère le
// fichier avec fetch puis on le propose au téléchargement.
export async function telechargerAvecJeton(url, accessToken, nomFichier) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Téléchargement impossible.");
  }
  const blob = await res.blob();
  const lien = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = lien;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(lien), 10000);
}
