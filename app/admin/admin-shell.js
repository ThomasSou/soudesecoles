"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../lib/supabaseClient";

const ONGLETS = [
  { href: "/admin", label: "Tableau de bord", perm: null },
  { href: "/admin/demandes", label: "Demandes d'inscription", perm: "demandes" },
  { href: "/admin/familles", label: "Familles", perm: "familles" },
  { href: "/admin/enfants", label: "Enfants", perm: "familles" },
  { href: "/admin/emails", label: "E-mails", perm: "emails" },
  { href: "/admin/boutique", label: "Boutique", perm: "boutique" },
  { href: "/admin/avantages", label: "Avantages", perm: "avantages" },
  { href: "/admin/messages", label: "Messages reçus", perm: "messages" },
  { href: "/admin/statistiques", label: "Statistiques", perm: "statistiques" },
  { href: "/admin/acces", label: "Accès", perm: "acces" },
];

// Enveloppe commune au back-office : vérifie que l'utilisateur connecté fait
// partie du bureau, puis affiche la navigation (filtrée selon ses droits) et
// le contenu. `children` est une fonction qui reçoit le jeton d'accès et le
// parent connecté (avec ses permissions).
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

  const perms = parent?.permissions || {};
  const onglets = ONGLETS.filter((o) => !o.perm || perms[o.perm]);
  const pageAutorisee = ONGLETS.find((o) => o.href === pathname);
  const accesRefusePourCettePage =
    pageAutorisee && pageAutorisee.perm && !perms[pageAutorisee.perm];

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
        <h1 className="text-3xl font-bold text-sou-blue">{title}</h1>
        <p className="text-sm text-slate-500">
          Connecté en tant que {parent?.firstName} {parent?.lastName}
          {parent?.title ? ` — ${parent.title}` : ""}
        </p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200 mb-8">
        {onglets.map((o) => {
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

      {accesRefusePourCettePage ? (
        <p className="text-slate-500">
          Vous n&apos;avez pas le droit d&apos;accéder à cette section. Un
          membre du bureau ayant le droit « Gestion des accès » peut vous
          l&apos;accorder depuis l&apos;onglet Accès.
        </p>
      ) : (
        children(accessToken, parent)
      )}
    </section>
  );
}
