import Image from "next/image";
import { PageHeader } from "../components";

// Dates au format ISO (YYYY-MM-DD). Le statut (à venir / dernière édition)
// est calculé automatiquement par rapport à la date du jour.
const EVENTS = [
  {
    name: "Loto",
    date: "2026-01-25",
    desc: "Une après-midi conviviale, de nombreux lots à gagner, pour financer les projets de l'année.",
  },
  {
    name: "Marché de Noël",
    date: "2026-12-06",
    approx: true,
    desc: "Marché artisanal et animations pour les familles, début décembre.",
  },
  {
    name: "Montmerle part en Live",
    date: "2027-06-06",
    desc: "Événement musical grand public au Parc de la Batellerie.",
    image: null,
  },
  {
    name: "Vide-greniers",
    date: "2026-05-17",
    desc: "Brocante ouverte à tous, exposants et visiteurs.",
    image: "/evenements/vide-greniers.jpg",
  },
  {
    name: "Foire",
    date: "2026-09-05",
    approx: true,
    desc: "Participation à la traditionnelle foire de Montmerle, avec jambon à la broche et rôti de dinde.",
    image: "/evenements/foire.jpg",
  },
  {
    name: "Fête de l'école",
    date: "2026-06-26",
    desc: "La fête de fin d'année, moment fort pour les enfants, au site des Mûriers.",
    image: "/evenements/fete-ecole.png",
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

function getStatus(event) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(event.date);
  const prefix = event.approx ? "vers le " : "le ";
  if (eventDate >= today) {
    return { label: "Manifestation à venir", detail: `${prefix}${formatDate(event.date)}`, upcoming: true };
  }
  return { label: "Dernière édition", detail: `${prefix}${formatDate(event.date)}`, upcoming: false };
}

export default function EvenementsPage() {
  return (
    <>
      <PageHeader
        title="Événements"
        subtitle="Le calendrier détaillé de la saison, avec dates, lieux et modalités d'inscription."
      />
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid gap-6 sm:grid-cols-2">
        {EVENTS.map((e) => {
          const status = getStatus(e);
          return (
            <div key={e.name} className="border border-slate-200 rounded-xl overflow-hidden">
              {e.image && (
                <div className="relative w-full h-40">
                  <Image src={e.image} alt={e.name} fill className="object-cover" />
                </div>
              )}
              <div className="p-6">
                <p
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    status.upcoming ? "text-sou-gold" : "text-slate-400"
                  }`}
                >
                  {status.label} — {status.detail}
                </p>
                <h2 className="text-xl font-bold text-sou-blue mt-1">{e.name}</h2>
                <p className="text-slate-600 mt-2 text-sm">{e.desc}</p>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
