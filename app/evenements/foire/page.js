import Image from "next/image";
import Link from "next/link";
import { formatEventDates, getEvent } from "../data";

export const metadata = {
  title: "Foire de Montmerle 2026 — Sou des Écoles Montmerle-Lurcy",
  description:
    "Les 4 et 5 septembre 2026 : banquet gallo-romain, feu d'artifice, foire commerciale et spectacles équestres médiévaux à Montmerle-sur-Saône.",
};

const PROGRAMME = [
  {
    jour: "Vendredi 4 septembre",
    horaire: "dès 19h",
    fin: "jusqu'à minuit",
    temps: [
      {
        heure: "19h",
        titre: "Banquet gallo-romain",
        texte:
          "Une soirée en famille autour d'un banquet préparé par les écoles de Montmerle-sur-Saône.",
      },
      {
        heure: "19h",
        titre: "Défis en famille",
        texte:
          "Chamboule-tout, panier basket, lancer d'anneau... des défis parents-enfants organisés par le comité des fêtes.",
      },
      {
        heure: "22h",
        titre: "Feu d'artifice",
        texte:
          "Le feu d'artifice du 14 juillet, reporté au 4 septembre : un spectacle sur les bords de Saône pour clôturer la soirée.",
      },
    ],
  },
  {
    jour: "Samedi 5 septembre",
    horaire: "dès 10h",
    fin: "jusqu'à minuit",
    temps: [
      {
        heure: "10h",
        titre: "Foire commerciale",
        texte:
          "Foire en plein air, artisanat local, produits du terroir et rencontres avec les producteurs.",
      },
      {
        heure: "Journée",
        titre: "Spectacles équestres médiévaux",
        texte:
          "Chevaliers et chevaux en démonstration, pour les amateurs comme pour les curieux.",
      },
      {
        heure: "Journée",
        titre: "Animations pour les petits et les grands",
        texte:
          "Animations tout au long de la journée, avec un grapheur en démonstration.",
      },
      {
        heure: "Soirée",
        titre: "Soirée DJ & quiz sur écran géant",
        texte: "Pour terminer la journée en musique et en équipes.",
      },
    ],
  },
];

const REPAS = [
  {
    nom: "Jambon à la broche",
    precision: "servi chaud",
    formules: [
      "Dans une baguette, salade et sauce au choix",
      "Avec frites ou salade grecque",
    ],
  },
  {
    nom: "Rôti de dinde",
    precision: "servi froid — halal sur demande",
    formules: [
      "Dans une baguette, salade et sauce au choix",
      "Avec frites ou salade grecque",
    ],
  },
  {
    nom: "Moules-frites",
    precision: "samedi midi uniquement",
    formules: [],
  },
];

const SERVICES = [
  { quand: "Vendredi soir", detail: "à partir de 19h" },
  { quand: "Samedi midi", detail: "moules-frites disponibles" },
  { quand: "Samedi soir", detail: "jusqu'à la soirée DJ" },
];

export default function FoirePage() {
  const event = getEvent("foire");

  return (
    <>
      <section className="relative bg-sou-blue text-white">
        <div className="absolute inset-0 opacity-25">
          <Image
            src="/evenements/foire.jpg"
            alt=""
            fill
            className="object-cover"
            priority
          />
        </div>
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <Link
            href="/evenements"
            className="text-sm text-white/70 hover:text-white"
          >
            ← Tous les événements
          </Link>
          <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-white/80">
            {formatEventDates(event)}
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold mt-2">
            Foire de Montmerle
          </h1>
          <p className="mt-4 text-lg text-white/90 max-w-2xl">
            Deux jours de fête sur les bords de Saône, entre banquet
            gallo-romain, feu d&apos;artifice, foire commerciale et spectacles
            équestres médiévaux.
          </p>
        </div>
      </section>

      {/* Offre repas du Sou — mise en avant */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 -mt-8 relative">
        <div className="bg-white border-2 border-sou-gold rounded-2xl shadow-lg p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-sou-gold">
            La buvette du Sou des Écoles
          </p>
          <h2 className="text-2xl font-bold text-sou-blue mt-1">
            Nos repas sur place
          </h2>
          <p className="text-slate-600 mt-2">
            Toute la recette finance les projets des écoles de
            Montmerle-Lurcy. Service le vendredi soir, le samedi midi et le
            samedi soir.
          </p>

          <div className="grid gap-4 sm:grid-cols-3 mt-6">
            {SERVICES.map((s) => (
              <div
                key={s.quand}
                className="bg-slate-50 rounded-xl px-4 py-3 text-center"
              >
                <p className="font-semibold text-sou-blue">{s.quand}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.detail}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 sm:grid-cols-3 mt-8">
            {REPAS.map((r) => (
              <div key={r.nom} className="border border-slate-200 rounded-xl p-5">
                <h3 className="font-bold text-sou-blue">{r.nom}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{r.precision}</p>
                {r.formules.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {r.formules.map((f) => (
                      <li key={f} className="text-sm text-slate-600 flex gap-2">
                        <span className="text-sou-gold">•</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <p className="text-sm text-slate-500 mt-6">
            Buvette sur place tout au long de la manifestation.
          </p>
        </div>
      </section>

      {/* Programme */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-2xl font-bold text-sou-blue mb-8">Le programme</h2>

        <div className="space-y-10">
          {PROGRAMME.map((jour) => (
            <div key={jour.jour}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-3 border-b border-slate-200">
                <h3 className="text-xl font-bold text-sou-blue">{jour.jour}</h3>
                <span className="text-sm font-semibold text-sou-gold">
                  {jour.horaire}
                </span>
                <span className="text-sm text-slate-400">{jour.fin}</span>
              </div>

              <ul className="mt-5 space-y-5">
                {jour.temps.map((t) => (
                  <li key={t.titre} className="flex gap-5">
                    <span className="w-20 shrink-0 text-sm font-semibold text-slate-500 pt-0.5">
                      {t.heure}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-800">{t.titre}</p>
                      <p className="text-sm text-slate-600 mt-0.5">{t.texte}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 bg-slate-50 rounded-xl p-6">
          <h3 className="font-semibold text-sou-blue mb-2">Infos pratiques</h3>
          <p className="text-sm text-slate-600">
            {event.place}. Manifestation organisée avec le comité des fêtes, la
            commune de Montmerle-sur-Saône et le Département de l&apos;Ain.
            Animations, artisanat, produits du terroir et restauration sur
            place.
          </p>
        </div>
      </section>
    </>
  );
}
