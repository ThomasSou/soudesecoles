import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "../components";
import { EVENTS, formatEventDates, isUpcoming, sortEvents } from "./data";

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
          const upcoming = isUpcoming(e);
          const card = (
            <>
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
                  {formatEventDates(e)}
                </p>
                <h2 className="text-xl font-bold text-sou-blue mt-1">{e.name}</h2>
                {e.place && (
                  <p className="text-sm text-slate-500 mt-0.5">{e.place}</p>
                )}
                <p className="text-slate-600 mt-2 text-sm">{e.desc}</p>
                {e.hasPage && (
                  <p className="mt-3 text-sm font-semibold text-sou-blue">
                    Voir le programme →
                  </p>
                )}
              </div>
            </>
          );

          const classes = `border rounded-xl overflow-hidden block ${
            upcoming ? "border-slate-200" : "border-slate-100 bg-slate-50/60"
          } ${e.hasPage ? "hover:border-sou-blue transition-colors" : ""}`;

          return e.hasPage ? (
            <Link key={e.slug} href={`/evenements/${e.slug}`} className={classes}>
              {card}
            </Link>
          ) : (
            <div key={e.slug} className={classes}>
              {card}
            </div>
          );
        })}
      </section>
    </>
  );
}
