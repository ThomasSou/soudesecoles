import Link from "next/link";
import Image from "next/image";

const EVENTS_PREVIEW = [
  { name: "Loto", period: "Hiver" },
  { name: "Marché de Noël", period: "Décembre" },
  { name: "Montmerle part en Live", period: "Mai" },
  { name: "Vide-greniers", period: "Printemps" },
  { name: "Fête de l'école", period: "Juin" },
];

export default function HomePage() {
  return (
    <>
      <section className="bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid gap-10 sm:grid-cols-2 items-center">
          <div>
            <p className="uppercase tracking-wide text-sou-gold font-semibold text-sm mb-3">
              Depuis 1903
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold text-sou-blue leading-tight">
              Le Sou des Écoles de Montmerle-Lurcy
            </h1>
            <p className="mt-5 text-lg text-slate-600">
              Nous participons au financement des activités sportives, ludiques,
              culturelles et du matériel mis en place par les équipes
              enseignantes des écoles de Montmerle-sur-Saône, au bénéfice de
              tous les élèves.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/inscription"
                className="bg-sou-blue text-white font-semibold px-6 py-3 rounded-full hover:bg-sou-gold transition-colors"
              >
                Créer mon espace famille
              </Link>
              <Link
                href="/evenements"
                className="border border-sou-blue text-sou-blue font-semibold px-6 py-3 rounded-full hover:bg-slate-50 transition-colors"
              >
                Voir les événements
              </Link>
            </div>
          </div>
          <div className="flex justify-center">
            <Image
              src="/logo/logo.png"
              alt="Logo du Sou des Écoles de Montmerle-Lurcy"
              width={280}
              height={280}
              priority
            />
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-2xl font-bold text-sou-blue mb-8">
          Nos prochains temps forts
        </h2>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {EVENTS_PREVIEW.map((e) => (
            <div
              key={e.name}
              className="border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow"
            >
              <p className="font-semibold text-sou-blue">{e.name}</p>
              <p className="text-sm text-slate-500 mt-1">{e.period}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-500 mt-6">
          Calendrier détaillé et dates précises bientôt disponibles sur la
          page{" "}
          <Link href="/evenements" className="underline text-sou-blue">
            Événements
          </Link>
          .
        </p>
      </section>

      <section className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 grid gap-8 sm:grid-cols-3">
          <div>
            <p className="text-3xl font-bold text-sou-gold">1903</p>
            <p className="text-slate-600 mt-1">Année de création de l'association</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-sou-gold">Toutes les classes</p>
            <p className="text-slate-600 mt-1">
              De la petite section au CM2
            </p>
          </div>
          <div>
            <p className="text-3xl font-bold text-sou-gold">100% bénévole</p>
            <p className="text-slate-600 mt-1">
              Un bureau et des commissions animés par des parents
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
