import Link from "next/link";
import Image from "next/image";
import { PARTNERS } from "./partenaires/data";

const BANNER_SIZES = {
  Gold: "w-40 h-20 sm:w-48 sm:h-24",
  Silver: "w-28 h-14 sm:w-32 sm:h-16",
  Bronze: "w-16 h-8 sm:w-20 sm:h-10",
};

const NAV_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/evenements", label: "Événements" },
  { href: "/boutique", label: "Boutique" },
  { href: "/partenaires", label: "Partenaires" },
  { href: "/presse", label: "Presse" },
  { href: "/contact", label: "Contact" },
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
          href="/espace-adherent"
          className="hidden sm:inline-block bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-sou-gold transition-colors"
        >
          Espace adhérent
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
          href="/espace-adherent"
          className="block text-center bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-sou-gold transition-colors"
        >
          Espace adhérent
        </Link>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="bg-sou-blue text-slate-200 mt-20">
      <div className="bg-white border-b border-slate-200">
        <Link
          href="/partenaires"
          aria-label="Voir la page de nos partenaires"
          className="block max-w-6xl mx-auto px-4 sm:px-6 py-6"
        >
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">
            Merci à nos partenaires
          </p>
          <div className="flex flex-wrap items-end justify-center gap-x-10 gap-y-5">
            {PARTNERS.map((p) => (
              <div
                key={p.slug}
                className={`relative ${BANNER_SIZES[p.tier] || BANNER_SIZES.Bronze}`}
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
        </Link>
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-3 text-sm">
        <div>
          <p className="font-bold text-white mb-2">Sou des Écoles Laïques Montmerle-Lurcy</p>
          <p>Association loi 1901 — depuis 1903</p>
          <p>Mairie, 01090 Montmerle-sur-Saône</p>
        </div>
        <div>
          <p className="font-bold text-white mb-2">Contact</p>
          <p>contactsoudesecolesmontmerle@gmail.com</p>
        </div>
        <div>
          <p className="font-bold text-white mb-2">Suivez-nous</p>
          <p>Facebook · Instagram (bientôt)</p>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Sou des Écoles Montmerle-Lurcy — site en construction
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
