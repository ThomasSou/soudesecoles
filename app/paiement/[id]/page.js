"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "../../components";

function formatMontant(cents) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

// Page de retour après un paiement HelloAsso d'encaissement libre (réglé
// par un membre du bureau, ou par un parent depuis un lien reçu par
// e-mail). Publique : accessible sans compte ni droit back-office.
export default function PaiementPage() {
  const { id } = useParams();
  const [etat, setEtat] = useState("chargement"); // chargement | paye | attente | erreur
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    fetch(`/api/paiement/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) {
          setEtat("erreur");
          return;
        }
        setDetail(data);
        setEtat(data.status === "paid" ? "paye" : "attente");
      })
      .catch(() => setEtat("erreur"));
  }, [id]);

  return (
    <>
      <PageHeader title="Paiement" subtitle="Sou des Écoles Montmerle-Lurcy" />
      <section className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
        {etat === "chargement" && <p className="text-slate-500">Vérification du paiement...</p>}

        {etat === "paye" && (
          <>
            <p className="text-3xl mb-3">✅</p>
            <h1 className="text-xl font-bold text-sou-blue mb-2">Merci !</h1>
            <p className="text-slate-600">
              Votre paiement de {formatMontant(detail.montantCents)} pour « {detail.motif} » a bien
              été enregistré.
            </p>
          </>
        )}

        {etat === "attente" && (
          <>
            <h1 className="text-xl font-bold text-sou-blue mb-2">Paiement en cours de vérification</h1>
            <p className="text-slate-600">
              Nous n&apos;avons pas encore reçu la confirmation de HelloAsso. Rechargez cette page
              dans quelques instants.
            </p>
          </>
        )}

        {etat === "erreur" && (
          <>
            <h1 className="text-xl font-bold text-sou-blue mb-2">Lien invalide</h1>
            <p className="text-slate-600">Ce lien de paiement n&apos;existe pas ou n&apos;est plus valide.</p>
          </>
        )}

        <Link href="/admin/encaissements" className="inline-block mt-8 text-sm text-sou-blue underline">
          Retour au back-office
        </Link>
      </section>
    </>
  );
}
