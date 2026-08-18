import { PageHeader } from "../components";

export default function PressePage() {
  return (
    <>
      <PageHeader
        title="Presse"
        subtitle="Retrouvez ici les articles parus sur nos événements et nos actions."
      />
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
        <p className="text-slate-500">
          Les articles de presse seront publiés ici prochainement.
        </p>
      </section>
    </>
  );
}
