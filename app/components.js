import Link from "next/link";
import Image from "next/image";
import { PARTNERS, TIER_ORDER } from "./partenaires/data";

const BANNER_SIZES = {
  Gold: "w-40 h-12 sm:w-48 sm:h-14", // hauteur serrée sur le logo Barrels (très large) : pas de vide au-dessus et au-dessous
  Silver: "w-28 h-14 sm:w-32 sm:h-16",
  Bronze: "w-16 h-8 sm:w-20 sm:h-10",
};

const NAV_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/evenements", label: "Événements" },
  { href: "/benevoles", label: "Bénévoles" },
  { href: "/boutique", label: "Boutique" },
  { href: "/partenaires", label: "Partenaires" },
  { href: "/presse", label: "Presse" },
  { href: "/contact", label: "Contact" },
];

// Soutiens institutionnels affichés en bas du site (« Avec le soutien de »),
// avec un lien vers leur site quand il y en a un. Les mairies de Montmerle-sur-Saône
// et de Lurcy sont les communes des écoles.
const SOUTIENS = [
  {
    nom: "La Région Auvergne-Rhône-Alpes",
    src: "/partenaires/region-auvergne-rhone-alpes.png",
    alt: "La Région Auvergne-Rhône-Alpes soutient votre projet",
  },
  {
    nom: "Mairie de Montmerle-sur-Saône",
    src: "/partenaires/mairie-montmerle.png",
    alt: "Mairie de Montmerle-sur-Saône",
    href: "https://www.mairie-montmerle.fr/",
  },
  {
    nom: "Mairie de Lurcy",
    src: "/partenaires/mairie-lurcy.png",
    alt: "Mairie de Lurcy",
    href: "https://lurcy.fr/",
  },
];

export function Header() {
  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <Image src="/logo/logo.png" alt="Logo Sou des Écoles" width={44} height={44} className="rounded-full" />
          <span className="font-bold text-sou-blue leading-tight text-sm sm:text-base">
            Sou des Écoles
            <br className="hidden sm:block" /> Montmerle-Lurcy
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-700">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-sou-blue transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/connexion"
          className="hidden sm:inline-block bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-sou-gold transition-colors"
        >
          Connexion
        </Link>
      </div>
      <nav className="md:hidden flex overflow-x-auto gap-4 px-4 pb-3 text-sm font-medium text-slate-700">
        {NAV_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="whitespace-nowrap hover:text-sou-blue">
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="md:hidden px-4 pb-3">
        <Link
          href="/connexion"
          className="block text-center bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-sou-gold transition-colors"
        >
          Connexion
        </Link>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="bg-sou-blue text-slate-200 mt-20">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-10">
          <Link
            href="/partenaires"
            aria-label="Voir la page de nos partenaires"
            className="block"
          >
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">
              Merci à nos partenaires
            </p>
            {/* Une ligne par palier : or, puis argent, puis bronze. Chaque logo peut
                être légèrement agrandi ou réduit (`echelle` dans data.js) pour
                un équilibre visuel : un logo en hauteur paraît plus petit qu'un
                logo large dans une même boîte. Les logos d'une ligne sont centrés
                en hauteur, l'échelle part du centre de la boîte. */}
            <div className="space-y-8">
              {TIER_ORDER.map((palier) => {
                const ligne = PARTNERS.filter((p) => p.tier === palier);
                return ligne.length === 0 ? null : (
                  <div key={palier} className="flex flex-wrap items-center justify-center gap-x-10 gap-y-8">
                    {ligne.map((p) => (
                      <div
                        key={p.slug}
                        className={`relative ${BANNER_SIZES[p.tier] || BANNER_SIZES.Bronze}`}
                        style={
                          p.echelle && p.echelle !== 1
                            ? { transform: `scale(${p.echelle})`, transformOrigin: "center" }
                            : undefined
                        }
                      >
                        <Image
                          src={`/partenaires/${p.file}`}
                          alt={`Logo ${p.name}`}
                          fill
                          className="object-contain"
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </Link>
          <div className="hidden sm:block w-px self-stretch bg-slate-200" aria-hidden="true" />
          <div>
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">
              Avec le soutien de
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {SOUTIENS.map((so) => {
                const logo = (
                  <div className="relative w-20 h-20">
                    <Image src={so.src} alt={so.alt} fill className="object-contain" />
                  </div>
                );
                return so.href ? (
                  <a
                    key={so.nom}
                    href={so.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${so.nom} (nouvel onglet)`}
                    className="block hover:opacity-80 transition-opacity"
                  >
                    {logo}
                  </a>
                ) : (
                  <div key={so.nom}>{logo}</div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-3 text-sm">
        <div>
          <p className="font-bold text-white mb-2">Sou des Écoles Laïques Montmerle-Lurcy</p>
          <p>Association loi 1901 — depuis 1903</p>
          <p>1 parvis des enfants d&apos;Izieu, 01090 Montmerle-sur-Saône</p>
        </div>
        <div>
          <p className="font-bold text-white mb-2">Contact</p>
          <p>contact@sou-montmerle.fr</p>
        </div>
        <div>
          <p className="font-bold text-white mb-2">Suivez-nous</p>
          <p>Facebook · Instagram (bientôt)</p>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-slate-400 space-y-2">
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link href="/mentions-legales" className="hover:text-white transition-colors">
            Mentions légales
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/confidentialite" className="hover:text-white transition-colors">
            Confidentialité et données personnelles
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/contact" className="hover:text-white transition-colors">
            Contact
          </Link>
        </div>
        {/* Un seul point d'entrée : la page de connexion aiguille selon le
            profil (bureau, enseignant, partenaire, parent). */}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link href="/connexion" className="hover:text-white transition-colors">
            Connexion (parents, enseignants, partenaires)
          </Link>
        </div>
        <p>© {new Date().getFullYear()} Sou des Écoles Montmerle-Lurcy — site en construction</p>
      </div>
    </footer>
  );
}

export function PageHeader({ title, subtitle }) {
  return (
    <div className="bg-slate-50 border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-sou-blue">{title}</h1>
        {subtitle && <p className="mt-3 text-slate-600 max-w-2xl">{subtitle}</p>}
      </div>
    </div>
  );
}
