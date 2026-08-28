import { PageHeader } from "../components";

export const metadata = {
  title: "Mentions légales — Sou des Écoles Montmerle-Lurcy",
  description: "Mentions légales du site du Sou des Écoles Laïques Montmerle-Lurcy.",
};

export default function MentionsLegalesPage() {
  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <PageHeader title="Mentions légales" />

      <div className="prose prose-slate max-w-none text-slate-700 space-y-6 mt-8">
        <div>
          <h2 className="text-lg font-bold text-sou-blue mb-2">Éditeur du site</h2>
          <p>
            Sou des Écoles Laïques de Montmerle-Lurcy, association loi 1901 fondée en 1903.
            <br />
            Siège social : 1 parvis des enfants d&apos;Izieu, 01090 Montmerle-sur-Saône.
            <br />
            Contact :{" "}
            <a href="mailto:contact@sou-montmerle.fr" className="text-sou-blue underline">
              contact@sou-montmerle.fr
            </a>
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-sou-blue mb-2">Directeur de la publication</h2>
          <p>Le président de l&apos;association, représentant légal.</p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-sou-blue mb-2">Hébergement</h2>
          <p>
            Le site est hébergé par Netlify, Inc., 512 2nd Street, Suite 200, San Francisco,
            CA 94107, États-Unis.
            <br />
            Les données des adhérents sont hébergées par Supabase au sein de l&apos;Union européenne.
            <br />
            Le nom de domaine et la messagerie sont gérés par Infomaniak Network SA, Rue Eugène-Marziano 25,
            1227 Genève, Suisse.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-sou-blue mb-2">Paiements en ligne</h2>
          <p>
            Les paiements (cotisations et commandes) sont traités par HelloAsso, qui agit comme
            prestataire de paiement. Aucune coordonnée bancaire ne transite ni n&apos;est conservée
            par le présent site.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-sou-blue mb-2">Propriété intellectuelle</h2>
          <p>
            Les textes et photographies publiés sur ce site sont la propriété de l&apos;association,
            sauf mention contraire. Les logos de nos partenaires restent la propriété de leurs
            détenteurs respectifs et sont utilisés avec leur accord.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-sou-blue mb-2">Signaler un contenu</h2>
          <p>
            Pour toute demande de correction ou de retrait d&apos;un contenu (notamment une
            photographie sur laquelle figure votre enfant), écrivez-nous : nous traitons ces
            demandes en priorité.
          </p>
        </div>
      </div>
    </section>
  );
}
