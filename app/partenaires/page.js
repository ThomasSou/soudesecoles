import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "../components";

const TIERS = [
  { name: "Gold", color: "bg-amber-400", desc: "Visibilité maximale sur nos communications" },
  { name: "Silver", color: "bg-slate-300", desc: "Visibilité intermédiaire" },
  { name: "Bronze", color: "bg-orange-300", desc: "Visibilité standard" },
];

const PARTNERS = [
  { name: "Barrels", file: "barrels.png" },
  { name: "Diennet", file: "diennet.jpg" },
  { name: "Emile Job", file: "emilejob.jpg" },
  { name: "Flandin", file: "flandin.jpg" },
  { name: "Millésimes et Cuvées", file: "millesime.jpg" },
  { name: "Nicod", file: "nicod.jpg" },
  { name: "SPAR", file: "spar.jpg" },
];

export default function PartenairesPage() {
  return (
    <>
      <PageHeader
        title="Nos partenaires"
        subtitle="Grâce à leur soutien annuel, nos partenaires locaux nous aident à financer les activités de nos enfants."
      />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid gap-4 sm:grid-cols-3 mb-14">
          {TIERS.map((t) => (
            <div key={t.name} className="border border-slate-200 rounded-xl p-5">
              <span
                className={`inline-block ${t.color} text-xs font-bold uppercase px-3 py-1 rounded-full text-slate-800 mb-3`}
              >
                {t.name}
              </span>
              <p className="text-sm text-slate-600">{t.desc}</p>
            </div>
          ))}
        </div>

        <h2 className="text-2xl font-bold text-sou-blue mb-8">
          Ils nous font confiance
        </h2>
        <div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {PARTNERS.map((p) => (
            <div
              key={p.name}
              className="border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-3"
            >
              <div className="relative w-full h-20">
                <Image
                  src={`/partenaires/${p.file}`}
                  alt={`Logo ${p.name}`}
                  fill
                  className="object-contain"
                />
              </div>
              <p className="text-sm font-medium text-slate-600">{p.name}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
          <h3 className="text-xl font-bold text-sou-blue">
            Vous souhaitez devenir partenaire ?
          </h3>
          <p className="text-slate-600 mt-2 max-w-xl mx-auto">
            Contactez-nous pour découvrir nos différentes formules de
            partenariat et rejoindre les entreprises qui soutiennent les
            écoles de Montmerle-Lurcy.
          </p>
          <Link
            href="/contact"
            className="inline-block mt-5 bg-sou-blue text-white font-semibold px-6 py-3 rounded-full hover:bg-sou-gold transition-colors"
          >
            Nous contacter
          </Link>
        </div>
      </section>
    </>
  );
}
