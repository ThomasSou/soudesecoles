import FormulaireContact from "../formulaire-contact";
import { PageHeader } from "../components";

export const metadata = {
  title: "Contact — Sou des Écoles Montmerle-Lurcy",
};

export default function ContactPage() {
  return (
    <>
      <PageHeader
        title="Contact"
        subtitle="Une question, une envie de rejoindre une commission, ou de devenir partenaire ? Écrivez-nous."
      />

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
        <div className="border border-slate-200 rounded-xl p-8">
          <FormulaireContact />
        </div>

        <div className="mt-8 text-sm text-slate-500 text-center space-y-2">
          <p>
            Vous êtes parent d&apos;élève et souhaitez créer votre compte ?{" "}
            <a href="/inscription" className="text-sou-blue underline">
              Faire une demande d&apos;inscription
            </a>
          </p>
          <p>
            Vous pouvez aussi nous écrire directement à{" "}
            <a
              href="mailto:contact@sou-montmerle.fr"
              className="text-sou-blue underline"
            >
              contact@sou-montmerle.fr
            </a>
          </p>
          <p>
            Sou des Écoles Laïques Montmerle-Lurcy — 1 parvis des enfants
            d&apos;Izieu, 01090 Montmerle-sur-Saône
          </p>
        </div>
      </section>
    </>
  );
}
