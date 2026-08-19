"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "./admin-shell";

export default function AdminAccueilPage() {
  return (
    <AdminShell title="Back-office">
      {(token) => <TableauDeBord token={token} />}
    </AdminShell>
  );
}

function TableauDeBord({ token }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch("/api/admin/demandes", { headers }).then((r) => r.json()),
      fetch("/api/admin/messages", { headers }).then((r) => r.json()),
    ]).then(([d, m]) => {
      setStats({
        demandesEnAttente: (d.demandes || []).filter(
          (x) => x.status === "pending"
        ).length,
        messagesNonTraites: (m.messages || []).filter((x) => !x.handled).length,
      });
    });
  }, [token]);

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Link
        href="/admin/demandes"
        className="border border-slate-200 rounded-xl p-6 hover:border-sou-blue transition-colors"
      >
        <p className="text-sm text-slate-500">Demandes d&apos;inscription</p>
        <p className="text-3xl font-bold text-sou-blue mt-1">
          {stats ? stats.demandesEnAttente : "—"}
        </p>
        <p className="text-sm text-slate-500 mt-1">en attente de validation</p>
      </Link>

      <Link
        href="/admin/messages"
        className="border border-slate-200 rounded-xl p-6 hover:border-sou-blue transition-colors"
      >
        <p className="text-sm text-slate-500">Messages reçus</p>
        <p className="text-3xl font-bold text-sou-blue mt-1">
          {stats ? stats.messagesNonTraites : "—"}
        </p>
        <p className="text-sm text-slate-500 mt-1">non traités</p>
      </Link>
    </div>
  );
}
