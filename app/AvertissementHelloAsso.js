// Conseil affiché à tout le monde avant le départ vers la page de paiement
// HelloAsso. HelloAsso ajoute automatiquement une « contribution volontaire à
// HelloAsso » ; elle est facultative et modifiable. Sur un téléphone, elle ne
// s'est pas laissé modifier à cause du cache du navigateur (le même paiement
// fonctionnait en navigation privée) : rien ne permet de dire que cela ne
// concerne qu'un navigateur ou qu'un appareil, d'où un message général, sans
// détection du navigateur, qui renvoie vers la navigation privée ou un autre
// navigateur.
export default function AvertissementHelloAsso({ className = "" }) {
  return (
    <div className={`text-sm bg-amber-50 border border-amber-300 text-amber-900 rounded-lg px-3 py-2 ${className}`} role="note">
      <p className="font-semibold">Bon à savoir sur la page de paiement</p>
      <p className="mt-1">
        HelloAsso ajoute <strong>automatiquement</strong> une contribution volontaire à son propre service. Elle n&apos;est{" "}
        <strong>pas obligatoire</strong> : vous pouvez la modifier ou la supprimer (« autre montant »).
      </p>
      <p className="mt-1">
        Si la modification ne fonctionne pas, c&apos;est probablement un souci de votre navigateur (par exemple son cache) :
        essayez en <strong>navigation privée</strong>, ou avec un <strong>autre navigateur</strong>. Une question ?
        contact@sou-montmerle.fr
      </p>
    </div>
  );
}
