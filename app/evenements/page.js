import Image from "next/image";
import { PageHeader } from "../components";

// Dates officielles saison 2026-2027 (fiche de demande de créneaux, Mairie
// de Montmerle-sur-Saône). Le tri et le statut sont calculés automatiquement :
// les manifestations à venir apparaissent en premier, dans l'ordre
// chronologique ; celles déjà passées basculent en fin de liste.
const EVENTS = [
  {
    name: "Foire",
    date: "2026-09-05",
    approx: true,
    place: "Montmerle-sur-Saône",
    desc: "Participation à la traditionnelle foire de Montmerle : jambon à la broche, rôti de dinde et moules-frites le samedi midi.",
    image: "/evenements/foire.jpg",
  },
  {
    name: "Marché de Noël",
    date: "2026-11-28",
    place: "Place du marché",
    desc: "Marché artisanal et animations pour les familles, de 10h30 à 20h30.",
  },
  {
    name: "Loto",
    date: "2027-01-31",
    place: "Salle des fêtes",
    desc: "Une après-midi conviviale et de nombreux lots à gagner, de 12h à 18h30.",
  },
  {
    name: "Montmerle part en Live",
    date: "2027-05-02",
    place: "Parc de la Batellerie",
    desc: "Événement musical grand public : DJ sets, food et cocktails, de 10h à 16h30.",
  },
  {
    name: "Vide-greniers",
    date: "2027-05-16",
    place: "Site des Mûriers",
    desc: "Brocante ouverte à tous, exposants et visiteurs, de 4h à 18h.",
  },
  {
    name: "Fête de l'école",
    date: "2027-06-25",
    place: "Site des Mûriers",
    desc: "La fête de fin d'année, moment fort pour les enfants, de 16h à 21h.",
  },
];

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MOIS[m - 1]} ${y}`;
}

function isUpcoming(iso) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(iso) >= today;
}

// Les manifestations à venir d'abord (de la plus proche à la plus lointaine),
// puis les passées (de la plus récente à la plus ancienne).
function sortEvents(events) {
  const upcoming = events
    .filter((e) => isUpcoming(e.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = events
    .filter((e) => !isUpcoming(e.date))
    .sort((a, b) => b.date.localeCompare(a.date));
  return [...upcoming, ...past];
}

export default function EvenementsPage() {
  const events = sortEvents(EVENTS);

  return (
    <>
      <PageHeader
        title="Événements"
        subtitle="Le calendrier de la saison, avec dates, lieux et modalités d'inscription. La prochaine manifestation est toujours en tête de liste."
      />
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid gap-6 sm:grid-cols-2">
        {events.map((e) => {
          const upcoming = isUpcoming(e.date);
          const prefix = e.approx ? "vers le " : "le ";
          return (
            <div
              key={e.name}
              className={`border rounded-xl overflow-hidden ${
                upcoming ? "border-slate-200" : "border-slate-100 bg-slate-50/60"
              }`}
            >
              {e.image && (
                <div className="relative w-full h-40">
                  <Image src={e.image} alt={e.name} fill className="object-cover" />
                </div>
              )}
              <div className="p-6">
                <p
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    upcoming ? "text-sou-gold" : "text-slate-400"
                  }`}
                >
                  {upcoming ? "Manifestation à venir" : "Dernière édition"} —{" "}
                  {prefix}
                  {formatDate(e.date)}
                </p>
                <h2 className="text-xl font-bold text-sou-blue mt-1">{e.name}</h2>
                {e.place && (
                  <p className="text-sm text-slate-500 mt-0.5">{e.place}</p>
                )}
                <p className="text-slate-600 mt-2 text-sm">{e.desc}</p>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
