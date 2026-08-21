import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Agrégats pour le tableau de bord : sur les N derniers jours, on renvoie le
// total par jour et le classement des pages, liens sortants et e-mails.
export async function GET(request) {
  const auth = await requirePermission(request, "statistiques");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const jours = Math.min(Math.max(Number(url.searchParams.get("jours")) || 30, 1), 365);
  const depuis = new Date();
  depuis.setDate(depuis.getDate() - jours + 1);
  const depuisIso = depuis.toISOString().slice(0, 10);

  const { data, error } = await auth.admin
    .from("stats_daily")
    .select("day, kind, target, count")
    .gte("day", depuisIso);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lignes = data || [];

  const classement = (kind) => {
    const totaux = new Map();
    for (const l of lignes) {
      if (l.kind !== kind) continue;
      totaux.set(l.target, (totaux.get(l.target) || 0) + l.count);
    }
    return [...totaux.entries()]
      .map(([target, count]) => ({ target, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);
  };

  const parJour = new Map();
  for (const l of lignes) {
    if (l.kind !== "page") continue;
    parJour.set(l.day, (parJour.get(l.day) || 0) + l.count);
  }
  const courbe = [...parJour.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const total = (kind) =>
    lignes.filter((l) => l.kind === kind).reduce((s, l) => s + l.count, 0);

  return NextResponse.json({
    ok: true,
    jours,
    totaux: {
      pages: total("page"),
      liens: total("lien"),
      emailsOuverts: total("email_ouverture"),
      emailsCliques: total("email_clic"),
    },
    courbe,
    pages: classement("page"),
    liens: classement("lien"),
    emails: classement("email_ouverture"),
  });
}
