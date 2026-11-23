"use client";

// Avertissement (au conditionnel) affiché uniquement aux visiteurs de Firefox sur
// Android : sur la page de paiement HelloAsso, la « contribution volontaire à
// HelloAsso » n'a pas pu être modifiée sur UN téléphone (Pixel 8, Firefox à jour),
// alors que tout fonctionne avec Chrome, avec Firefox en mode ordinateur, sur
// PC et sur un autre téléphone Android (Samsung) avec Firefox. Cause inconnue :
// appareil, réglage ou page de HelloAsso. D'où un message prudent, qui ne
// prétend pas que Firefox sur Android est en cause partout.
//
// Détection côté navigateur après affichage (pas à l'hébergement) pour éviter
// tout écart entre ce que le serveur et le navigateur affichent. En « mode
// ordinateur », Firefox ne se présente plus comme Android : l'avertissement
// disparaît, ce qui est voulu puisque cela fonctionne alors.
import { useEffect, useState } from "react";

export default function AvertissementHelloAsso({ className = "" }) {
  const [concerne, setConcerne] = useState(false);

  useEffect(() => {
    try {
      const ua = navigator.userAgent || "";
      setConcerne(/Android/i.test(ua) && /Firefox\//i.test(ua));
    } catch {
      setConcerne(false);
    }
  }, []);

  if (!concerne) return null;
  return (
    <div className={`text-sm bg-amber-50 border border-amber-300 text-amber-900 rounded-lg px-3 py-2 ${className}`} role="note">
      <p className="font-semibold">Un petit conseil si vous utilisez Firefox sur téléphone</p>
      <p className="mt-1">
        Sur la page de paiement de HelloAsso, la contribution volontaire à HelloAsso (facultative) pourrait ne pas se laisser
        modifier avec certains téléphones sous Firefox. Si c'est votre cas, ouvrez cette page avec <strong>Chrome</strong>, depuis{" "}
        <strong>un ordinateur</strong>, ou activez le <strong>mode ordinateur</strong> de Firefox (menu ⋮ puis « Version pour
        ordinateur »).
      </p>
      <p className="mt-1 text-xs">
        Cela dépend de la page de paiement de HelloAsso et de votre appareil, pas du site du Sou des Écoles.
      </p>
    </div>
  );
}
