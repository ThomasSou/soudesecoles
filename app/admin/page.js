"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "./admin-shell";

export default function AdminAccueilPage() {
  return (
    <AdminShell title="Back-office">
      {(token, parent) => <TableauDeBord token={token} perms={parent?.permissions || {}} />}
    </AdminShell>
  );
}

function TableauDeBord({ token, perms }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      perms.demandes
        ? fetch("/api/admin/demandes", { headers }).then((r) => r.json())
        : Promise.resolve(null),
      perms.messages
        ? fetch("/api/admin/messages", { headers }).then((r) => r.json())
        : Promise.resolve(null),
      perms.familles
        ? fetch("/api/admin/familles", { headers }).then((r) => r.json())
        : Promise.resolve(null),
    ]).then(([d, m, f]) => {
      const familles = f ? f.familles || [] : null;
      setStats({
        demandesEnAttente: d
          ? (d.demandes || []).filter((x) => x.status === "pending").length
          : null,
        messagesNonTraites: m
          ? (m.messages || []).filter((x) => !x.handled).length
          : null,
        familles: familles ? familles.length : null,
        famillesSansCompte: familles
          ? familles.filter((x) => x.parents.length === 0).length
          : null,
      });
    });
  }, [token, perms.demandes, perms.messages, perms.familles]);

  const cartes = [];

  if (perms.demandes) {
    cartes.push(
      <Link
        key="demandes"
        href="/admin/demandes"
        className="border border-slate-200 rounded-xl p-6 hover:border-sou-blue transition-colors"
      >
        <p className="text-sm text-slate-500">Demandes d&apos;inscription</p>
        <p className="text-3xl font-bold text-sou-blue mt-1">
          {stats ? stats.demandesEnAttente : "—"}
        </p>
        <p className="text-sm text-slate-500 mt-1">en attente de validation</p>
      </Link>
    );
  }

  if (perms.messages) {
    cartes.push(
      <Link
        key="messages"
        href="/admin/messages"
        className="border border-slate-200 rounded-xl p-6 hover:border-sou-blue transition-colors"
      >
        <p className="text-sm text-slate-500">Messages reçus</p>
        <p className="text-3xl font-bold text-sou-blue mt-1">
          {stats ? stats.messagesNonTraites : "—"}
        </p>
        <p className="text-sm text-slate-500 mt-1">non traités</p>
      </Link>
    );
  }

  if (perms.familles) {
    cartes.push(
      <Link
        key="familles"
        href="/admin/familles"
        className="border border-slate-200 rounded-xl p-6 hover:border-sou-blue transition-colors"
      >
        <p className="text-sm text-slate-500">Familles enregistrées</p>
        <p className="text-3xl font-bold text-sou-blue mt-1">
          {stats ? stats.familles : "—"}
        </p>
        <p className="text-sm text-slate-500 mt-1">au total</p>
      </Link>
    );

    cartes.push(
      <Link
        key="sans-compte"
        href="/admin/familles"
        className={`border rounded-xl p-6 transition-colors ${
          stats && stats.famillesSansCompte > 0
            ? "border-amber-300 bg-amber-50 hover:border-amber-400"
            : "border-slate-200 hover:border-sou-blue"
        }`}
      >
        <p className="text-sm text-slate-500">Familles sans compte</p>
        <p
          className={`text-3xl font-bold mt-1 ${
            stats && stats.famillesSansCompte > 0
              ? "text-amber-700"
              : "text-sou-blue"
          }`}
        >
          {stats ? stats.famillesSansCompte : "—"}
        </p>
        <p className="text-sm text-slate-500 mt-1">invitation à renvoyer</p>
      </Link>
    );
  }

  if (cartes.length === 0) {
    return (
      <p className="text-slate-500">
        Aucune section ne vous a encore été ouverte. Un membre du bureau
        ayant le droit « Gestion des accès » peut vous accorder des droits
        depuis l&apos;onglet Accès.
      </p>
    );
  }

  return <div className="grid gap-5 sm:grid-cols-2">{cartes}</div>;
}
