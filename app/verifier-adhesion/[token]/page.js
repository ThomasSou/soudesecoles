import { createAdminClient } from "../../lib/supabaseServerAdmin";
import { currentSchoolYear } from "../../lib/anneeScolaire";
import PanneauAvantage from "./panneau-avantage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vérification d'adhésion — Sou des Écoles Montmerle-Lurcy",
};

export default async function VerifierAdhesionPage({ params }) {
  const { token } = params;
  const anneeEnCours = currentSchoolYear();

  let membership = null;
  let parents = [];
  let erreur = false;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("memberships")
      .select("id, school_year, amount, paid_at, family_id")
      .eq("qr_code_token", token)
      .maybeSingle();

    if (error) {
      erreur = true;
    } else if (data) {
      membership = data;
      const { data: parentRows } = await admin
        .from("parents")
        .select("first_name, last_name")
        .eq("family_id", data.family_id);
      parents = parentRows || [];
    }
  } catch {
    erreur = true;
  }

  const valide =
    !!membership &&
    !!membership.paid_at &&
    membership.school_year === anneeEnCours;

  const nomFamille = parents.length
    ? parents
        .map((p) => `${p.first_name || ""} ${p.last_name || ""}`.trim())
        .filter(Boolean)
        .join(" & ")
    : null;

  return (
    <section className="max-w-md mx-auto px-4 sm:px-6 py-16">
      {erreur ? (
        <Bandeau
          couleur="slate"
          titre="Vérification impossible"
          message="Impossible de vérifier cette carte pour le moment. Merci de réessayer."
        />
      ) : !membership ? (
        <Bandeau
          couleur="red"
          titre="Carte inconnue"
          message="Ce QR code ne correspond à aucune adhésion enregistrée."
        />
      ) : valide ? (
        <Bandeau
          couleur="green"
          titre="Adhésion valide"
          message={`Adhésion à jour pour l'année scolaire ${membership.school_year}.`}
          famille={nomFamille}
          details={`Valable jusqu'au 31 août ${membership.school_year.split("-")[1]}`}
        />
      ) : !membership.paid_at ? (
        <Bandeau
          couleur="slate"
          titre="Non cotisant"
          message={`Cette famille n'est pas à jour de sa cotisation pour l'année scolaire ${membership.school_year}.`}
          famille={nomFamille}
        />
      ) : (
        <Bandeau
          couleur="red"
          titre="Adhésion expirée"
          message={`Cette carte concerne l'année scolaire ${membership.school_year}. L'année en cours est ${anneeEnCours}.`}
          famille={nomFamille}
          details="Une nouvelle adhésion est nécessaire."
        />
      )}

      {membership && <PanneauAvantage familyId={membership.family_id} token={token} />}

      <p className="text-center text-xs text-slate-400 mt-8">
        Sou des Écoles Laïques Montmerle-Lurcy
      </p>
    </section>
  );
}

const COULEURS = {
  green: "bg-green-50 border-green-200 text-green-800",
  red: "bg-red-50 border-red-200 text-red-800",
  amber: "bg-amber-50 border-amber-200 text-amber-800",
  slate: "bg-slate-50 border-slate-200 text-slate-700",
};

const ICONES = { green: "✓", red: "✕", amber: "!", slate: "✕" };

function Bandeau({ couleur, titre, message, famille, details }) {
  return (
    <div className={`border rounded-2xl p-8 text-center ${COULEURS[couleur]}`}>
      <div className="text-5xl font-bold mb-4">{ICONES[couleur]}</div>
      <h1 className="text-2xl font-bold mb-2">{titre}</h1>
      {famille && <p className="text-lg font-semibold mb-2">{famille}</p>}
      <p className="text-sm">{message}</p>
      {details && <p className="text-xs mt-3 opacity-80">{details}</p>}
    </div>
  );
}
