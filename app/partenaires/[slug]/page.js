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
        <p className="text-slate-500 text-sm max-w-md">
          Plus d'informations sur ce partenaire seront bientôt disponibles ici
          (présentation, activité, lien vers leur site).
        </p>
      </div>
    </section>
  );
}
