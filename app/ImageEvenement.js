"use client";

// Image d'une manifestation sur l'accueil. On ne connaît pas à l'avance sa
// forme (affiche en hauteur, bannière large, photo) : une fois chargée, une
// affiche en hauteur est cadrée sur son haut (titre et date lisibles), tout
// le reste est montré en entier sur un fond flou de la même image — rien n'est
// rogné au milieu d'un mot.
import { useEffect, useRef, useState } from "react";

export default function ImageEvenement({ src, alt }) {
  const [enHauteur, setEnHauteur] = useState(false);
  const ref = useRef(null);
  const mesurer = (img) => {
    if (img && img.naturalWidth > 0) setEnHauteur(img.naturalHeight / img.naturalWidth > 1.15);
  };
  // L'image du serveur peut être déjà chargée avant que React ne prenne la main :
  // son événement « load » est alors passé, on la mesure directement.
  useEffect(() => {
    if (ref.current?.complete) mesurer(ref.current);
  }, [src]);
  return (
    <div className="relative w-full h-44 overflow-hidden bg-slate-100">
      {!enHauteur && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-60"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={(e) => mesurer(e.currentTarget)}
        className={`relative w-full h-full ${enHauteur ? "object-cover object-top" : "object-contain"}`}
      />
    </div>
  );
}
