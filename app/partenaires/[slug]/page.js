import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PARTNERS } from "../data";
import { RenduModules } from "../RenduModules";
import { createAdminClient } from "../../lib/supabaseServerAdmin";

// Page rendue à chaque visite : elle peut afficher une version éditée par le
// partenaire et validée par le bureau (table partenaire_pages).
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Version publiée en base, ou null (alors : affichage codé en dur de data.js).
// Toute erreur retombe sur l'affichage historique : la page ne doit jamais casser.
async function pagePubliee(slug) {
  try {
    const admin = createAdminClient();
    const { data: p } = await admin.from("partenaires").select("id, active").eq("slug", slug).maybeSingle();
    if (!p || p.active === false) return null;
    const { data: page } = await admin.from("partenaire_pages").select("publie").eq("partenaire_id", p.id).maybeSingle();
    return page?.publie?.modules?.length ? page.publie : null;
  } catch {
    return null;
  }
}

export default async function PartnerPage({ params }) {
  const partner = PARTNERS.find((p) => p.slug === params.slug);
  if (!partner) return notFound();
  const publiee = await pagePubliee(partner.slug);

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

        {publiee ? (
          <RenduModules contenu={publiee} />
        ) : partner.description ? (
          <p className="text-slate-600 max-w-xl">{partner.description}</p>
        ) : (
          <p className="text-slate-500 text-sm max-w-md">
            Plus d'informations sur ce partenaire seront bientôt disponibles ici
            (présentation, activité, lien vers leur site).
          </p>
        )}

        {!publiee && (partner.address || partner.phone || partner.email || partner.website) && (
          <div className="w-full max-w-md border-t border-slate-100 pt-4 mt-2 space-y-1 text-sm text-slate-600 text-center">
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
