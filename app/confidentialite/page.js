import { PageHeader } from "../components";

export const metadata = {
  title: "Confidentialité et données personnelles — Sou des Écoles Montmerle-Lurcy",
  description:
    "Quelles données le Sou des Écoles Montmerle-Lurcy collecte, pourquoi, combien de temps, et comment exercer vos droits.",
};

function Section({ titre, children }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-sou-blue mb-2">{titre}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export default function ConfidentialitePage() {
  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <PageHeader
        title="Confidentialité et données personnelles"
        subtitle="Ce que nous collectons, pourquoi, et comment reprendre la main."
      />

      <div className="text-slate-700 space-y-8 mt-8">
        <p className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
          En résumé : nous ne collectons que ce qui est nécessaire à la vie de l&apos;association,
          nous ne revendons ni ne transmettons vos données à des tiers à des fins commerciales,
          et notre mesure d&apos;audience ne dépose <strong>aucun cookie</strong> et ne permet pas
          de vous identifier.
        </p>

        <Section titre="Qui est responsable de vos données">
          <p>
            Le Sou des Écoles Laïques de Montmerle-Lurcy, association loi 1901, siège en mairie de
            Montmerle-sur-Saône. Pour toute question relative à vos données :{" "}
            <a href="mailto:contact@sou-montmerle.fr" className="text-sou-blue underline">
              contact@sou-montmerle.fr
            </a>
            .
          </p>
        </Section>

        <Section titre="Quelles données et pourquoi">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Familles adhérentes</strong> — nom, prénom, adresse, e-mail, téléphone des
              parents ; prénom, nom et classe des enfants. Objectif : gérer les adhésions, les
              commandes et informer des manifestations. Base légale : exécution de l&apos;adhésion
              et intérêt légitime de l&apos;association.
            </li>
            <li>
              <strong>Commandes et cotisations</strong> — montant, date, moyen de paiement. Objectif :
              suivi comptable de l&apos;association. Base légale : obligation légale de tenue des comptes.
            </li>
            <li>
              <strong>Messages envoyés via le formulaire de contact</strong> — objectif : vous répondre.
            </li>
            <li>
              <strong>Mesure d&apos;audience</strong> — nombre de pages vues et de clics par jour,
              sans adresse IP ni identifiant de visiteur. Base légale : intérêt légitime.
            </li>
          </ul>
          <p className="text-sm text-slate-500">
            Nous ne collectons aucune donnée sensible (santé, opinions, origine).
          </p>
        </Section>

        <Section titre="Cookies">
          <p>
            Ce site ne dépose <strong>aucun cookie publicitaire ni de mesure d&apos;audience</strong>.
            Le seul cookie utilisé est celui qui vous maintient connecté à votre espace famille : il
            est strictement nécessaire au fonctionnement du service et, à ce titre, ne requiert pas
            votre consentement. Il disparaît lorsque vous vous déconnectez.
          </p>
          <p>
            C&apos;est aussi la raison pour laquelle vous ne voyez pas de bandeau de consentement :
            nous avons volontairement conçu la mesure de fréquentation pour ne pas en avoir besoin.
          </p>
        </Section>

        <Section titre="E-mails que nous envoyons">
          <p>
            Nos e-mails contiennent une image de mesure qui nous indique combien de personnes les ont
            ouverts, et nos liens passent par une redirection qui compte les clics. Ces mesures sont
            <strong> globales</strong> : elles ne nous disent pas qui a ouvert ni qui a cliqué.
          </p>
          <p>
            Chaque e-mail comporte un lien de désinscription en bas de page. Un clic suffit, sans
            justification à fournir.
          </p>
        </Section>

        <Section titre="Qui d'autre voit vos données">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Supabase</strong> — hébergement de la base de données, dans l&apos;Union européenne.</li>
            <li><strong>Netlify</strong> — hébergement du site.</li>
            <li><strong>Infomaniak</strong> — nom de domaine et messagerie (Suisse).</li>
            <li><strong>HelloAsso</strong> — traitement des paiements. Les coordonnées bancaires ne nous parviennent jamais.</li>
          </ul>
          <p>
            Ces prestataires agissent pour notre compte. Aucune donnée n&apos;est vendue, louée ou
            transmise à des fins publicitaires.
          </p>
        </Section>

        <Section titre="Combien de temps nous les conservons">
          <ul className="list-disc pl-5 space-y-1">
            <li>Données des familles : pendant l&apos;adhésion, puis 3 ans après le dernier contact.</li>
            <li>Pièces comptables (cotisations, commandes) : 10 ans, comme l&apos;impose la loi.</li>
            <li>Messages du formulaire de contact : 1 an.</li>
            <li>Statistiques de fréquentation : 2 ans, sous forme de compteurs uniquement.</li>
          </ul>
        </Section>

        <Section titre="Vos droits">
          <p>
            Vous pouvez à tout moment demander à consulter vos données, les faire corriger, les faire
            effacer, en obtenir une copie, ou vous opposer à leur utilisation. Une partie est
            directement modifiable depuis votre espace famille.
          </p>
          <p>
            Pour le reste, écrivez à{" "}
            <a href="mailto:contact@sou-montmerle.fr" className="text-sou-blue underline">
              contact@sou-montmerle.fr
            </a>{" "}
            : nous répondons sous un mois. Si notre réponse ne vous satisfait pas, vous pouvez saisir
            la CNIL (
            <a
              href="https://www.cnil.fr"
              className="text-sou-blue underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              cnil.fr
            </a>
            ).
          </p>
        </Section>

        <Section titre="Photographies">
          <p>
            Des photos prises lors de nos manifestations peuvent illustrer le site. Si vous ou votre
            enfant y figurez et que vous souhaitez le retrait d&apos;une image, demandez-le-nous :
            nous la retirons sans discuter.
          </p>
        </Section>

        <p className="text-xs text-slate-400 pt-4 border-t border-slate-200">
          Dernière mise à jour : 21 août 2026.
        </p>
      </div>
    </section>
  );
}
