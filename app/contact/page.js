import { PageHeader } from "../components";

export default function ContactPage() {
  return (
    <>
      <PageHeader
        title="Contact"
        subtitle="Une question, une envie de rejoindre une commission, ou de devenir partenaire ? Écrivez-nous."
      />
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
        <div className="border border-slate-200 rounded-xl p-8">
          <p className="text-slate-600">
            Le formulaire de contact sera bientôt disponible directement ici.
            En attendant, vous pouvez nous écrire à :
          </p>
          <p className="mt-4 text-lg font-semibold text-sou-blue">
            contactsoudesecolesmontmerle@gmail.com
          </p>
          <p className="mt-6 text-sm text-slate-500">
            Sou des Écoles Laïques Montmerle-Lurcy — Mairie, 01090 Montmerle-sur-Saône
          </p>
        </div>
      </section>
    </>
  );
}
