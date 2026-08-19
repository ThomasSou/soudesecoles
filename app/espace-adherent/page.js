"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabaseClient";

const EMPTY_CHILD = { firstName: "", lastName: "", classLevel: "", teacherName: "" };

const PAYMENT_LABELS = {
  helloasso: "HelloAsso",
  sumup: "Carte bancaire",
  especes: "Espèces",
  cheque: "Chèque",
};

function formatPurchaseDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function EspaceAdherentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [family, setFamily] = useState(null);
  const [parents, setParents] = useState([]);
  const [children, setChildren] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [error, setError] = useState("");
  const [accessToken, setAccessToken] = useState(null);

  async function fetchFamilyData(supabase) {
    const [familyRes, parentsRes, childrenRes, purchasesRes, membershipRes] = await Promise.all([
      supabase.from("families").select("*").maybeSingle(),
      supabase.from("parents").select("*").order("first_name"),
      supabase.from("children").select("*").order("first_name"),
      supabase
        .from("purchases")
        .select("*")
        .order("purchased_at", { ascending: false }),
      supabase
        .from("memberships")
        .select("*")
        .order("school_year", { ascending: false }),
    ]);

    if (familyRes.error) setError(familyRes.error.message);

    setFamily(familyRes.data);
    setParents(parentsRes.data || []);
    setChildren(childrenRes.data || []);
    setPurchases(purchasesRes.data || []);
    setMemberships(membershipRes.data || []);
  }

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

      setAccessToken(session.access_token);

      await fetchFamilyData(supabase);
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
  const purchasesTotal = purchases.reduce(
    (sum, p) => sum + (p.amount != null ? Number(p.amount) : 0),
    0
  );

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
        <CompleterProfilForm
          accessToken={accessToken}
          onDone={async () => {
            setLoading(true);
            const supabase = createClient();
            await fetchFamilyData(supabase);
            setLoading(false);
          }}
        />
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
            {memberships.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-100">
                <p className="text-sm font-medium text-slate-600 mb-2">
                  Historique des adhésions
                </p>
                <ul className="divide-y divide-slate-100">
                  {memberships.map((m) => (
                    <li key={m.id} className="py-2 flex justify-between text-sm">
                      <span className="text-slate-700">
                        {m.school_year}
                        {m.paid_at ? (
                          <span className="text-slate-400 text-xs ml-2">
                            payée le {formatPurchaseDate(m.paid_at)}
                          </span>
                        ) : (
                          <span className="text-amber-600 text-xs ml-2">
                            en attente de paiement
                          </span>
                        )}
                      </span>
                      <span className="text-slate-600 whitespace-nowrap">
                        {m.amount != null ? `${Number(m.amount).toFixed(2)} €` : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="border border-slate-200 rounded-xl p-6">
            <h2 className="font-semibold text-sou-blue mb-3">Parents</h2>
            {parents.length === 0 ? (
              <p className="text-slate-500 text-sm">Aucun parent enregistré pour le moment.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {parents.map((parent) => (
                  <li key={parent.id} className="py-2 text-sm">
                    <div className="flex justify-between">
                      <span>
                        {parent.first_name} {parent.last_name}
                      </span>
                      <span
                        className={
                          isAdherent ? "text-green-700 font-medium" : "text-slate-500"
                        }
                      >
                        {isAdherent ? "Adhérent" : "Non adhérent"}
                      </span>
                    </div>
                    <div className="text-slate-500">
                      {parent.email}
                      {parent.phone ? ` — ${parent.phone}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
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
                    <span className="text-slate-500">
                      {child.class_level}
                      {child.teacher_name ? ` — ${child.teacher_name}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border border-slate-200 rounded-xl p-6">
            <h2 className="font-semibold text-sou-blue mb-3">
              Historique de mes achats
            </h2>
            {purchases.length === 0 ? (
              <p className="text-slate-500 text-sm">
                Aucun achat enregistré pour le moment. Vos participations aux
                manifestations (loto, vide-greniers, ventes...) apparaîtront ici.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {purchases.map((p) => (
                    <li key={p.id} className="py-3 flex justify-between gap-4 text-sm">
                      <div>
                        <p className="text-slate-700">{p.label}</p>
                        <p className="text-slate-400 text-xs mt-0.5">
                          {formatPurchaseDate(p.purchased_at)}
                          {p.school_year ? ` — ${p.school_year}` : ""}
                          {p.payment_method ? ` — ${PAYMENT_LABELS[p.payment_method] || p.payment_method}` : ""}
                        </p>
                      </div>
                      <span className="whitespace-nowrap font-medium text-slate-700">
                        {p.amount != null ? `${Number(p.amount).toFixed(2)} €` : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between pt-3 mt-1 border-t border-slate-200 text-sm font-semibold text-sou-blue">
                  <span>Total</span>
                  <span>{purchasesTotal.toFixed(2)} €</span>
                </div>
              </>
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

function CompleterProfilForm({ accessToken, onDone }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [children, setChildren] = useState([{ ...EMPTY_CHILD }]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  function updateChild(index, field, value) {
    setChildren((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");

    const res = await fetch("/api/inscription-famille", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken,
        firstName,
        lastName,
        phone,
        addressLine,
        postalCode,
        city,
        children,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      setFormError(result.error || "Une erreur est survenue.");
      setSubmitting(false);
      return;
    }

    onDone();
  }

  return (
    <div className="border border-slate-200 rounded-xl p-6">
      <h2 className="font-semibold text-sou-blue mb-1">Compléter mon profil famille</h2>
      <p className="text-sm text-slate-500 mb-6">
        Merci de renseigner vos coordonnées et vos enfants scolarisés pour
        activer votre espace.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <input placeholder="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
          <input placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
          <input placeholder="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
          <input placeholder="Adresse" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
          <input placeholder="Code postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
          <input placeholder="Ville" value={city} onChange={(e) => setCity(e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-600">Enfants scolarisés</p>
          {children.map((child, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-2 border border-slate-100 rounded-lg p-3">
              <input placeholder="Prénom" value={child.firstName} onChange={(e) => updateChild(i, "firstName", e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
              <input placeholder="Nom" value={child.lastName} onChange={(e) => updateChild(i, "lastName", e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
              <input placeholder="Classe" value={child.classLevel} onChange={(e) => updateChild(i, "classLevel", e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
              <input placeholder="Nom du maître / de la maîtresse" value={child.teacherName} onChange={(e) => updateChild(i, "teacherName", e.target.value)} className="border border-slate-300 rounded-lg px-4 py-2" />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setChildren((prev) => [...prev, { ...EMPTY_CHILD }])}
            className="text-sm text-sou-blue underline"
          >
            + Ajouter un enfant
          </button>
        </div>
        {formError && <p className="text-red-600 text-sm">{formError}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="bg-sou-blue text-white font-semibold px-6 py-2.5 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-60"
        >
          {submitting ? "Enregistrement..." : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}
