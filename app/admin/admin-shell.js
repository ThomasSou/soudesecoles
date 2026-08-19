"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../lib/supabaseClient";

const ONGLETS = [
  { href: "/admin", label: "Tableau de bord" },
  { href: "/admin/demandes", label: "Demandes d'inscription" },
  { href: "/admin/familles", label: "Familles" },
  { href: "/admin/messages", label: "Messages reçus" },
];

// Enveloppe commune au back-office : vérifie que l'utilisateur connecté fait
// partie du bureau, puis affiche la navigation et le contenu.
// `children` est une fonction qui reçoit le jeton d'accès.
export default function AdminShell({ title, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState("chargement");
  const [accessToken, setAccessToken] = useState(null);
  const [parent, setParent] = useState(null);

  useEffect(() => {
    const supabase = createClient();

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/connexion");
        return;
      }

      const res = await fetch("/api/admin/moi", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        setState("refuse");
        return;
      }

      const data = await res.json();
      setParent(data.parent);
      setAccessToken(session.access_token);
      setState("ok");
    }

    check();
  }, [router]);

  if (state === "chargement") {
    return (
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-20 text-center text-slate-500">
        Vérification de vos accès...
      </section>
    );
  }

  if (state === "refuse") {
    return (
      <section className="max-w-md mx-auto px-4 sm:px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-sou-blue mb-3">Accès refusé</h1>
        <p className="text-slate-600">
          Cet espace est réservé aux membres du bureau de l&apos;association.
        </p>
        <Link
          href="/espace-adherent"
          className="inline-block mt-6 text-sou-blue underline"
        >
          Retour à mon espace famille
        </Link>
      </section>
    );
  }

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
        <h1 className="text-3xl font-bold text-sou-blue">{title}</h1>
        <p className="text-sm text-slate-500">
          Connecté en tant que {parent?.firstName} {parent?.lastName}
        </p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200 mb-8">
        {ONGLETS.map((o) => {
          const actif = pathname === o.href;
          return (
            <Link
              key={o.href}
              href={o.href}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                actif
                  ? "border-sou-blue text-sou-blue"
                  : "border-transparent text-slate-500 hover:text-sou-blue"
              }`}
            >
              {o.label}
            </Link>
          );
        })}
      </nav>

      {children(accessToken)}
    </section>
  );
}
