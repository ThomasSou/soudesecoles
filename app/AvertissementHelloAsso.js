"use client";

// Avertissement affiché uniquement aux visiteurs de Firefox sur Android : sur la
// page de paiement HelloAsso, ce navigateur ne permet pas de modifier la
// « contribution volontaire à HelloAsso » (constaté avec Chrome sur téléphone,
// Firefox en mode ordinateur et Firefox sur PC : tout fonctionne). Défaut de la
// page hébergée par HelloAsso, hors de notre contrôle.
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
      <p className="font-semibold">Vous utilisez Firefox sur téléphone Android</p>
      <p className="mt-1">
        Sur la page de paiement de HelloAsso, un défaut de leur site empêche, avec ce navigateur, de modifier le montant de la
        contribution volontaire à HelloAsso (facultative). Pour la modifier ou la supprimer, ouvrez cette page avec{" "}
        <strong>Chrome</strong>, depuis <strong>un ordinateur</strong>, ou activez le <strong>mode ordinateur</strong> de Firefox
        (menu ⋮ puis « Version pour ordinateur »).
      </p>
      <p className="mt-1 text-xs">Ce problème vient de HelloAsso, il ne dépend pas du Sou des Écoles.</p>
    </div>
  );
}
