import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Marché de Noël artisanal 2026 — Sou des Écoles Montmerle-Lurcy",
  description:
    "Samedi 28 novembre 2026, de 11h à 20h, place du marché à Montmerle-sur-Saône : 37 artisans, Père Noël, calèche, spectacle de feu, défilé des lampions et commandes de sapins et gourmandises.",
};

// Programme tel que sur l'affiche officielle de la manifestation.
const PROGRAMME = [
  { heure: "11h", titre: "Ouverture du marché de Noël avec 37 artisans" },
  { heure: "11h – 13h30", titre: "Photo avec le Père Noël" },
  {
    heure: "11h30",
    titre: "Chorale des enfants de l'école Mick Micheyl",
    detail: "Maternelle et élémentaire",
  },
  { heure: "14h – 18h", titre: "Biathlon laser" },
  { heure: "15h", titre: "Début des tours de la calèche du Père Noël" },
  {
    heure: "15h – 16h",
    titre: "Concert du duo « TelPèreTelleFille »",
    detail: "Chants de Noël et Disney",
  },
  { heure: "15h30 – 17h30", titre: "Photo avec le Père Noël" },
  {
    heure: "16h30 – 18h30",
    titre: "Montmerle part en live — Winter édition",
    detail: "Scène ouverte de DJs",
  },
  { heure: "17h30", titre: "Spectacle de feu", vedette: true },
  { heure: "18h", titre: "Défilé des lampions derrière la calèche", vedette: true },
  { heure: "18h50", titre: "Dernier départ de la calèche du Père Noël" },
  { heure: "20h", titre: "Clôture du marché de Noël" },
];

const CHIFFRES = [
  { grand: "37", petit: "artisans", detail: "créateurs et producteurs locaux" },
  { grand: "11h → 20h", petit: "toute la journée", detail: "samedi 28 novembre" },
  { grand: "Père Noël", petit: "photos & calèche", detail: "dès 11h et dès 15h" },
  { grand: "17h30", petit: "spectacle de feu", detail: "puis défilé des lampions" },
];

const COMMANDES = ["Sapins", "Panettones", "Pain d'épices", "Tartiflette", "Boules de Noël"];

const VERT = "bg-[#12392b]";
const NEIGE = {
  backgroundImage:
    "radial-gradient(circle at 20% 30%, rgba(255,255,255,.14) 0 2px, transparent 3px), radial-gradient(circle at 70% 20%, rgba(255,255,255,.12) 0 1.5px, transparent 2.5px), radial-gradient(circle at 45% 75%, rgba(255,255,255,.1) 0 2px, transparent 3px), radial-gradient(circle at 88% 65%, rgba(255,255,255,.12) 0 1.5px, transparent 2.5px)",
  backgroundSize: "180px 180px, 240px 240px, 210px 210px, 160px 160px",
};

export default function MarcheDeNoelPage() {
  return (
    <>
      {/* En-tête festif avec l'affiche */}
      <section className={`relative ${VERT} text-white overflow-hidden`} style={NEIGE}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-24 grid gap-10 lg:grid-cols-[1.25fr_1fr] items-center">
          <div>
            <Link href="/evenements" className="text-sm text-white/70 hover:text-white">
              ← Tous les événements
            </Link>
            <p className="mt-6 inline-block rounded-full bg-sou-gold/90 text-[#12392b] text-xs font-bold uppercase tracking-wider px-3 py-1">
              37 artisans
            </p>
            <h1 className="mt-4 text-4xl sm:text-6xl font-bold leading-[1.05]">
              Marché de Noël <span className="text-[#f2c879]">artisanal</span>
            </h1>
            <p className="mt-5 text-xl sm:text-2xl font-semibold text-white">
              Samedi 28 novembre 2026 · de 11h à 20h
            </p>
            <p className="mt-1 text-white/80">Place du marché, Montmerle-sur-Saône (Ain)</p>
            <p className="mt-5 text-white/85 max-w-xl">
              37 artisans, le Père Noël et sa calèche, un spectacle de feu et un défilé de lampions :
              une journée de fête pour toute la famille, organisée par le Sou des Écoles.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/boutique"
                className="rounded-full bg-sou-gold text-[#12392b] font-bold px-6 py-3 hover:brightness-110 transition"
              >
                Commander sapins &amp; gourmandises
              </Link>
              <a
                href="#programme"
                className="rounded-full border border-white/50 text-white font-semibold px-6 py-3 hover:bg-white/10 transition"
              >
                Voir le programme
              </a>
            </div>
          </div>

          <a
            href="/evenements/marche-de-noel-affiche.jpg"
            target="_blank"
            rel="noopener"
            className="block mx-auto max-w-[320px] rotate-2 hover:rotate-0 transition-transform duration-300"
            aria-label="Voir l'affiche en grand"
          >
            <Image
              src="/evenements/marche-de-noel-affiche.jpg"
              alt="Affiche du Marché de Noël artisanal, samedi 28 novembre 2026"
              width={1024}
              height={1536}
              priority
              className="w-full h-auto rounded-xl border-[6px] border-white shadow-2xl"
            />
          </a>
        </div>
      </section>

      {/* Chiffres clés */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 -mt-12 relative">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CHIFFRES.map((c) => (
            <div
              key={c.petit}
              className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5 text-center"
            >
              <p className="text-2xl sm:text-3xl font-bold text-[#9f1d2c] leading-tight">{c.grand}</p>
              <p className="text-sm font-semibold text-sou-blue mt-1">{c.petit}</p>
              <p className="text-xs text-slate-500 mt-0.5">{c.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Programme */}
      <section id="programme" className="max-w-3xl mx-auto px-4 sm:px-6 py-16 scroll-mt-20">
        <h2 className="text-3xl font-bold text-sou-blue">Le programme de la journée</h2>
        <p className="text-slate-500 mt-1">Samedi 28 novembre 2026 — place du marché</p>

        <ol className="mt-10 relative border-l-2 border-sou-gold/60 ml-2 space-y-1">
          {PROGRAMME.map((p) => (
            <li key={p.heure + p.titre} className="relative pl-8 py-3">
              <span
                className={`absolute -left-[9px] top-5 h-4 w-4 rounded-full border-2 border-white ${
                  p.vedette ? "bg-[#9f1d2c] ring-2 ring-[#9f1d2c]/30" : "bg-sou-gold"
                }`}
              />
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-x-6">
                <span className="sm:w-36 shrink-0 font-bold text-[#9f1d2c]">{p.heure}</span>
                <div>
                  <p className={`font-semibold ${p.vedette ? "text-[#9f1d2c]" : "text-slate-800"}`}>
                    {p.titre}
                  </p>
                  {p.detail && <p className="text-sm text-slate-500">{p.detail}</p>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Commandes */}
      <section className="bg-[#fbf5ec] border-y border-sou-gold/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 grid gap-8 md:grid-cols-[1.3fr_1fr] items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#9f1d2c]">Commandes ouvertes à tous</p>
            <h2 className="text-3xl font-bold text-sou-blue mt-1">Réservez dès maintenant</h2>
            <p className="text-slate-600 mt-3 max-w-xl">
              Précommandez en ligne vos sapins et vos gourmandises de Noël. Le paiement est sécurisé et
              toute la recette finance les projets des écoles de Montmerle-Lurcy.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {COMMANDES.map((c) => (
                <li
                  key={c}
                  className="rounded-full bg-white border border-sou-gold/50 text-[#12392b] text-sm font-semibold px-4 py-1.5"
                >
                  {c}
                </li>
              ))}
            </ul>
            <Link
              href="/boutique"
              className="mt-7 inline-block rounded-full bg-[#9f1d2c] text-white font-bold px-7 py-3 hover:bg-[#82172a] transition"
            >
              Commander en ligne
            </Link>
          </div>
          <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-6 text-center">
            <p className="text-5xl">🎄</p>
            <p className="font-bold text-sou-blue mt-2">Une idée de cadeau&nbsp;?</p>
            <p className="text-sm text-slate-600 mt-1">
              Boules de Noël, pain d&apos;épices, panettones : de quoi gâter vos proches tout en soutenant
              les enfants.
            </p>
          </div>
        </div>
      </section>

      {/* Chorale / bénévoles / infos */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 grid gap-6 md:grid-cols-2">
        <div className="bg-slate-50 rounded-2xl p-7">
          <h3 className="font-bold text-sou-blue text-lg">Infos pratiques</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              <strong className="text-slate-800">Quand :</strong> samedi 28 novembre 2026, de 11h à 20h
            </li>
            <li>
              <strong className="text-slate-800">Où :</strong> place du marché, Montmerle-sur-Saône (01)
            </li>
            <li>
              <strong className="text-slate-800">Sur place :</strong> buvettes, animations pour petits et grands,
              spectacle de feu et calèche du Père Noël
            </li>
          </ul>
        </div>
        <div className="bg-sou-blue text-white rounded-2xl p-7">
          <h3 className="font-bold text-lg">On a besoin de vous&nbsp;!</h3>
          <p className="mt-2 text-white/85 text-sm">
            Un coup de main sur la journée, un créneau à la buvette ou à l&apos;installation : chaque
            heure compte. Rejoignez l&apos;équipe de bénévoles.
          </p>
          <Link
            href="/benevoles"
            className="mt-5 inline-block rounded-full bg-sou-gold text-sou-blue font-bold px-6 py-2.5 hover:brightness-110 transition"
          >
            Je veux aider
          </Link>
        </div>
      </section>

      {/* Affiche du programme */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
        <h2 className="text-2xl font-bold text-sou-blue text-center">L&apos;affiche du programme</h2>
        <a
          href="/evenements/marche-de-noel-programme.webp"
          target="_blank"
          rel="noopener"
          className="block mt-6"
        >
          <Image
            src="/evenements/marche-de-noel-programme.webp"
            alt="Programme détaillé du Marché de Noël artisanal du 28 novembre 2026"
            width={1054}
            height={1492}
            className="mx-auto w-full max-w-md h-auto rounded-xl shadow-lg border border-slate-200"
          />
        </a>
        <p className="text-center text-xs text-slate-400 mt-2">Cliquez pour l&apos;afficher en grand et la partager.</p>
      </section>

    </>
  );
}
