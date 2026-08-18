import { PageHeader } from "../components";

const EVENTS = [
  { name: "Loto", period: "Hiver", desc: "Une soirée conviviale pour financer les projets de l'année." },
  { name: "Marché de Noël", period: "Décembre", desc: "Marché artisanal et animations pour les familles." },
  { name: "Montmerle part en Live", period: "Mai", desc: "Événement musical grand public." },
  { name: "Vide-greniers", period: "Printemps", desc: "Brocante ouverte à tous, exposants et visiteurs." },
  { name: "Foire", period: "Septembre", desc: "Participation à la traditionnelle foire de Montmerle." },
  { name: "Fête de l'école", period: "Juin", desc: "La fête de fin d'année, moment fort pour les enfants." },
];

export default function EvenementsPage() {
  return (
    <>
      <PageHeader
        title="Événements"
        subtitle="Le calendrier détaillé de la saison sera publié ici, avec dates, lieux et modalités d'inscription."
      />
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid gap-6 sm:grid-cols-2">
        {EVENTS.map((e) => (
          <div key={e.name} className="border border-slate-200 rounded-xl p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-sou-gold">
              {e.period}
            </p>
            <h2 className="text-xl font-bold text-sou-blue mt-1">{e.name}</h2>
            <p className="text-slate-600 mt-2 text-sm">{e.desc}</p>
          </div>
        ))}
      </section>
    </>
  );
}
