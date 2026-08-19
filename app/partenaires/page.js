import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "../components";
import { PARTNERS, TIER_ORDER, TIER_STYLES } from "./data";

export default function PartenairesPage() {
  return (
    <>
      <PageHeader
        title="Nos partenaires"
        subtitle="Grâce à leur soutien, nos partenaires locaux nous aident à financer les activités de nos enfants."
      />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 space-y-14">
        {TIER_ORDER.map((tier) => {
          const partners = PARTNERS.filter((p) => p.tier === tier);
          if (partners.length === 0) return null;
          const style = TIER_STYLES[tier];
          return (
            <div key={tier}>
              <h2 className="text-xl font-bold text-sou-blue mb-6">
                Partenaire {tier}
              </h2>
              <div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-4">
                {partners.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/partenaires/${p.slug}`}
                    className={`border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-3 hover:shadow-md hover:border-sou-gold transition-all ${style.card}`}
                  >
                    <div className={`relative w-full ${style.imgBox}`}>
                      <Image
                        src={`/partenaires/${p.file}`}
                        alt={`Logo ${p.name}`}
                        fill
                        className="object-contain"
                      />
                    </div>
                    <p className={`font-medium text-slate-700 ${style.title}`}>{p.name}</p>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
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
