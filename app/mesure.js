"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Mesure d'audience maison, sans cookie et sans stockage local : on se
// contente de signaler « une page a été vue » ou « un lien externe a été
// cliqué ». Aucun identifiant de visiteur n'est créé, donc aucun bandeau de
// consentement n'est requis.
function envoyer(kind, target) {
  try {
    const corps = JSON.stringify({ kind, target });
    // sendBeacon survit à la navigation en cours, contrairement à fetch.
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/stats", new Blob([corps], { type: "application/json" }));
      return;
    }
    fetch("/api/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: corps,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // La mesure ne doit jamais casser la navigation.
  }
}

export default function Mesure() {
  const pathname = usePathname();

  // Une page vue à chaque changement d'URL.
  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/admin")) return; // on ne compte pas le back-office
    envoyer("page", pathname);
  }, [pathname]);

  // Clics sortants : on écoute au niveau du document pour ne pas avoir à
  // modifier chaque lien du site.
  useEffect(() => {
    function onClick(e) {
      const lien = e.target?.closest?.("a[href]");
      if (!lien) return;
      const href = lien.getAttribute("href") || "";
      if (!href.startsWith("http")) return;
      try {
        const url = new URL(href);
        if (url.hostname === window.location.hostname) return;
        envoyer("lien", url.origin + url.pathname);
      } catch {
        // href malformé : on ignore.
      }
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
