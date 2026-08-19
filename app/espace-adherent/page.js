"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabaseClient";

export default function EspaceAdherentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [family, setFamily] = useState(null);
  const [children, setChildren] = useState([]);
  const [membership, setMembership] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/connexion");
        return;
      }

      const [familyRes, childrenRes, membershipRes] = await Promise.all([
        supabase.from("families").select("*").maybeSingle(),
        supabase.from("children").select("*").order("first_name"),
        supabase
          .from("memberships")
          .select("*")
          .order("school_year", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (familyRes.error) setError(familyRes.error.message);

      setFamily(familyRes.data);
      setChildren(childrenRes.data || []);
      setMembership(membershipRes.data);
      setLoading(false);
    }

    load();
  }, [router]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/connexion");
  }

  if (loading) {
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center text-slate-500">
        Chargement de votre espace...
      </section>
    );
  }

  const isAdherent = family?.status_current_year === "adherent";

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-sou-blue">Mon espace famille</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-slate-500 hover:text-sou-blue underline"
        >
          Se déconnecter
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-6">{error}</p>}

      {!family && !error && (
        <p className="text-slate-600">
          Votre fiche famille n'a pas encore été trouvée. Contactez le bureau
          si le problème persiste.
        </p>
      )}

      {family && (
        <div className="space-y-8">
          <div className="border border-slate-200 rounded-xl p-6">
            <h2 className="font-semibold text-sou-blue mb-3">Statut d'adhésion</h2>
            {isAdherent ? (
              <p className="text-green-700 font-medium">
                ✓ Famille adhérente pour l'année en cours
              </p>
            ) : (
              <div>
                <p className="text-slate-600 mb-3">
                  Vous n'êtes pas encore adhérent pour cette année scolaire.
                </p>
                <a
                  href="/contact"
                  className="inline-block bg-sou-blue text-white font-semibold px-5 py-2.5 rounded-full hover:bg-sou-gold transition-colors text-sm"
                >
                  Adhérer à l'association
                </a>
              </div>
            )}
            {membership && (
              <p className="text-sm text-slate-500 mt-3">
                Dernière adhésion enregistrée : {membership.school_year}
                {membership.amount ? ` — ${membership.amount} €` : ""}
              </p>
            )}
          </div>

          <div className="border border-slate-200 rounded-xl p-6">
            <h2 className="font-semibold text-sou-blue mb-3">
              Mes enfants scolarisés
            </h2>
            {children.length === 0 ? (
              <p className="text-slate-500 text-sm">Aucun enfant enregistré pour le moment.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {children.map((child) => (
                  <li key={child.id} className="py-2 flex justify-between text-sm">
                    <span>
                      {child.first_name} {child.last_name}
                    </span>
                    <span className="text-slate-500">{child.class_level}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border border-slate-200 rounded-xl p-6">
            <h2 className="font-semibold text-sou-blue mb-3">Coordonnées</h2>
            <p className="text-sm text-slate-600">
              {family.address_line}
              {family.address_line && <br />}
              {family.postal_code} {family.city}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
