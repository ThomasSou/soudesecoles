"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import FormulaireContact from "../formulaire-contact";
import { createClient } from "../lib/supabaseClient";
import {
  currentSchoolYear,
  findCurrentMembership,
  isMembershipValid,
} from "../lib/anneeScolaire";

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

const TARIFS_ADHESION = [
  { id: "jaime", label: "J'aime", montant: 17 },
  { id: "passionnement", label: "Passionnément", montant: 20 },
  { id: "folie", label: "À la folie", montant: 25 },
];
const MONTANT_LIBRE_MIN = 17;

// Paiement de la cotisation depuis l'espace adhérent : choix d'une formule
// (ou montant libre), puis redirection vers la page de paiement HelloAsso.
// HelloAsso refuse d'être affiché dans une fenêtre intégrée (iframe), d'où
// la redirection en pleine page ; le retour se fait via returnUrl.
function AdhesionPaiement({ accessToken, onPaid }) {
  const [choix, setChoix] = useState("jaime");
  const [montantLibre, setMontantLibre] = useState("");
  const [etape, setEtape] = useState("choix"); // choix | paiement | verification
  const [redirectUrl, setRedirectUrl] = useState(null);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const montant =
    choix === "libre" ? Number(montantLibre) || 0 : TARIFS_ADHESION.find((t) => t.id === choix)?.montant || 0;

  // Retour depuis HelloAsso après un paiement en pleine page : on nettoie
  // l'URL puis on vérifie auprès de HelloAsso que le paiement est bien passé.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const retour = params.get("adhesion");
    if (retour === "retour") {
      window.history.replaceState(null, "", window.location.pathname);
      verifier();
    } else if (retour === "erreur") {
      window.history.replaceState(null, "", window.location.pathname);
      setErreur("Le paiement n'a pas abouti. Vous pouvez réessayer.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verifier() {
    setEtape("verification");
    try {
      const res = await fetch("/api/espace-adherent/adhesion-statut", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (data.paid) {
        await onPaid();
      } else {
        setEtape("paiement");
      }
    } catch {
      setEtape("paiement");
    }
  }

  async function demarrer() {
    setErreur("");
    if (choix === "libre" && montant < MONTANT_LIBRE_MIN) {
      setErreur(`Le montant libre est de ${MONTANT_LIBRE_MIN} € minimum.`);
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch("/api/espace-adherent/adherer", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ amountEuros: montant }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
      setRedirectUrl(data.redirectUrl);
      setEtape("paiement");
      // HelloAsso interdit l'affichage en iframe : on quitte le site le temps
      // du paiement, le retour est assuré par returnUrl.
      window.location.href = data.redirectUrl;
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  if (etape === "paiement" && redirectUrl) {
    return (
      <div>
        <button
          onClick={() => setEtape("choix")}
          className="text-sm text-slate-500 mb-3"
        >
          ← Choisir une autre formule
        </button>
        <div className="border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
          <p className="mb-3">Redirection vers le paiement sécurisé HelloAsso...</p>
          <a
            href={redirectUrl}
            className="inline-block bg-sou-blue text-white font-semibold px-5 py-2.5 rounded-full"
          >
            Continuer vers le paiement
          </a>
          <p className="mt-3 text-xs text-slate-400">
            Si rien ne se passe, cliquez sur le bouton ci-dessus.
          </p>
        </div>
      </div>
    );
  }

  if (etape === "verification") {
    return (
      <div className="text-sm text-slate-600">
        <p className="mb-3">Vérification du paiement en cours...</p>
        <button
          onClick={verifier}
          className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full"
        >
          Vérifier à nouveau
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        {TARIFS_ADHESION.map((t) => (
          <button
            key={t.id}
            onClick={() => setChoix(t.id)}
            className={`border rounded-xl p-4 text-left transition-colors ${
              choix === t.id ? "border-sou-blue bg-sou-blue/5" : "border-slate-200"
            }`}
          >
            <p className="font-semibold text-slate-800">{t.label}</p>
            <p className="text-sou-blue font-bold mt-1">{t.montant} €</p>
          </button>
        ))}
      </div>
      <button
        onClick={() => setChoix("libre")}
        className={`w-full border rounded-xl p-4 text-left mb-4 transition-colors ${
          choix === "libre" ? "border-sou-blue bg-sou-blue/5" : "border-slate-200"
        }`}
      >
        <p className="font-semibold text-slate-800">Montant libre</p>
        {choix === "libre" && (
          <input
            type="number"
            min={MONTANT_LIBRE_MIN}
            step="1"
            autoFocus
            placeholder={`${MONTANT_LIBRE_MIN} € minimum`}
            value={montantLibre}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setMontantLibre(e.target.value)}
            className="mt-2 border border-slate-300 rounded-lg px-3 py-2 text-sm w-40"
          />
        )}
        {choix !== "libre" && (
          <p className="text-slate-400 text-sm mt-1">À partir de {MONTANT_LIBRE_MIN} €</p>
        )}
      </button>

      {erreur && <p className="text-sm text-red-600 mb-3">{erreur}</p>}

      <button
        onClick={demarrer}
        disabled={envoi}
        className="bg-sou-blue text-white font-semibold px-5 py-2.5 rounded-full hover:bg-sou-gold transition-colors text-sm disabled:opacity-50"
      >
        {envoi ? "Préparation du paiement..." : `Payer ${montant ? montant + " €" : ""}`}
      </button>
      <p className="text-xs text-slate-400 mt-2">Paiement sécurisé HelloAsso, sans quitter le site.</p>
    </div>
  );
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
  const [userEmail, setUserEmail] = useState("");
  const [estAdmin, setEstAdmin] = useState(false);

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
      setUserEmail(session.user?.email || "");

      // Les membres du bureau voient un accès au back-office.
      fetch("/api/admin/moi", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((r) => setEstAdmin(r.ok))
        .catch(() => setEstAdmin(false));

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

  const moi = parents.find((p) => p.email === userEmail);
  const nomAdherent = moi
    ? `${moi.first_name || ""} ${moi.last_name || ""}`.trim()
    : "";
  const anneeEnCours = currentSchoolYear();
  const adhesionEnCours = findCurrentMembership(memberships);
  const isAdherent = isMembershipValid(adhesionEnCours);
  const purchasesTotal = purchases.reduce(
    (sum, p) => sum + (p.amount != null ? Number(p.amount) : 0),
    0
  );

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-sou-blue">Mon espace famille</h1>
        <div className="flex items-center gap-4">
          {estAdmin && (
            <a
              href="/admin"
              className="text-sm font-semibold text-sou-blue hover:text-sou-gold"
            >
              Back-office →
            </a>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-slate-500 hover:text-sou-blue underline"
          >
            Se déconnecter
          </button>
        </div>
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
                ✓ Famille adhérente pour l'année scolaire {anneeEnCours}
              </p>
            ) : (
              <div>
                <p className="text-slate-600 mb-4">
                  Vous n'êtes pas encore adhérent pour l'année scolaire{" "}
                  {anneeEnCours}.
                </p>
                <AdhesionPaiement
                  accessToken={accessToken}
                  onPaid={() => fetchFamilyData(createClient())}
                />
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

          {isAdherent && adhesionEnCours && (
            <CarteAdhesion
              membership={adhesionEnCours}
              family={family}
              parents={parents}
              anneeEnCours={anneeEnCours}
            />
          )}

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

          <div className="border border-slate-200 rounded-xl p-6">
            <h2 className="font-semibold text-sou-blue mb-1">
              Nous contacter
            </h2>
            <p className="text-sm text-slate-500 mb-5">
              Une question, une remarque, une envie de donner un coup de main ?
              Écrivez-nous directement, nous vous répondons par e-mail.
            </p>
            <FormulaireContact
              defaultName={nomAdherent}
              defaultEmail={userEmail}
              locked={Boolean(nomAdherent && userEmail)}
              context="espace-adherent"
              compact
            />
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


function CarteAdhesion({ membership, family, parents, anneeEnCours }) {
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    if (!membership?.qr_code_token) return;
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/verifier-adhesion/${membership.qr_code_token}`;
    QRCode.toDataURL(url, { width: 320, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [membership]);

  const nomFamille =
    parents && parents.length > 0
      ? parents.map((p) => `${p.first_name || ""} ${p.last_name || ""}`.trim()).join(" & ")
      : "Famille adhérente";

  return (
    <div className="rounded-xl overflow-hidden border border-sou-blue/20">
      <div className="bg-sou-blue text-white px-6 py-4">
        <p className="text-xs uppercase tracking-wide text-white/70">
          Carte d&apos;adhésion
        </p>
        <p className="text-lg font-bold">Sou des Écoles Montmerle-Lurcy</p>
      </div>
      <div className="p-6 flex flex-col sm:flex-row gap-6 items-center">
        <div className="flex-1 text-center sm:text-left">
          <p className="text-xl font-bold text-sou-blue">{nomFamille}</p>
          <p className="text-slate-600 text-sm mt-1">
            {family?.postal_code} {family?.city}
          </p>
          <p className="mt-4 inline-block bg-green-50 text-green-700 text-sm font-semibold px-3 py-1.5 rounded-full">
            ✓ À jour — année {anneeEnCours}
          </p>
          <p className="text-xs text-slate-400 mt-3">
            Valable jusqu&apos;au 31 août {anneeEnCours.split("-")[1]}
          </p>
        </div>
        {qrDataUrl && (
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="QR code de la carte d'adhésion"
              className="w-40 h-40"
            />
            <p className="text-xs text-slate-400 mt-1">
              À présenter chez les partenaires participants et lors de nos manifestations
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
