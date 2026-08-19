import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PARTNERS } from "../data";

export function generateStaticParams() {
  return PARTNERS.map((p) => ({ slug: p.slug }));
}

export default function PartnerPage({ params }) {
  const partner = PARTNERS.find((p) => p.slug === params.slug);
  if (!partner) return notFound();

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
      <Link href="/partenaires" className="text-sm text-sou-blue hover:underline">
        ← Retour aux partenaires
      </Link>

      <div className="mt-6 border border-slate-200 rounded-xl p-8 flex flex-col items-center text-center gap-4">
        <span className="text-xs font-bold uppercase tracking-wide text-sou-gold">
          Partenaire {partner.tier}
        </span>
        <div className="relative w-full h-40">
          <Image
            src={`/partenaires/${partner.file}`}
            alt={`Logo ${partner.name}`}
            fill
            className="object-contain"
          />
        </div>
        <h1 className="text-2xl font-bold text-sou-blue">{partner.name}</h1>

        {partner.description ? (
          <p className="text-slate-600 max-w-xl">{partner.description}</p>
        ) : (
          <p className="text-slate-500 text-sm max-w-md">
            Plus d'informations sur ce partenaire seront bientôt disponibles ici
            (présentation, activité, lien vers leur site).
          </p>
        )}

        {(partner.address || partner.phone || partner.email || partner.website) && (
          <div className="w-full max-w-md border-t border-slate-100 pt-4 mt-2 space-y-1 text-sm text-slate-600">
            {partner.address && <p>{partner.address}</p>}
            {partner.phone && (
              <p>
                <a href={`tel:${partner.phone.replace(/\s/g, "")}`} className="hover:text-sou-blue">
                  {partner.phone}
                </a>
              </p>
            )}
            {partner.email && (
              <p>
                <a href={`mailto:${partner.email}`} className="hover:text-sou-blue">
                  {partner.email}
                </a>
              </p>
            )}
            {partner.website && (
              <p>
                <a
                  href={partner.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 bg-sou-blue text-white font-semibold px-5 py-2 rounded-full hover:bg-sou-gold transition-colors"
                >
                  Voir leur site
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
