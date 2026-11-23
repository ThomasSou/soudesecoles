import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { PARTNERS } from "../../../../partenaires/data";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const PERM = "partenaires";

const genererPin = () => String(Math.floor(1000 + Math.random() * 9000));
const norme = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// « 181 chemin des Vernailles, 69830 Saint-Georges-de-Reneins » -> rue, code postal, ville.
function decouperAdresse(adresse) {
  const m = /^(.*?),\s*(\d{5})\s+(.+)$/.exec(adresse || "");
  return m
    ? { adresse: m[1].trim(), code_postal: m[2], ville: m[3].trim() }
    : { adresse: adresse || null, code_postal: null, ville: null };
}

// Crée les FICHES des partenaires affichés sur le site (liste de
// app/partenaires/data.js) qui n'ont pas encore de fiche dans le back-office,
// avec le même « slug » que leur page publique. AUCUNE invitation, AUCUN
// e-mail : le compte de connexion ne se crée qu'à l'envoi de l'invitation
// (bouton dédié de chaque fiche).
//   POST { action: "apercu" } -> liste des fiches à créer, rien n'est écrit
//   POST { action: "creer" }  -> les crée
export async function POST(request) {
  const auth = await requirePermission(request, PERM);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { action } = await request.json().catch(() => ({}));
  if (!["apercu", "creer"].includes(action)) {
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  }

  const { data: existants, error } = await auth.admin.from("partenaires").select("id, nom, slug, email");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const slugs = new Set((existants || []).map((p) => p.slug).filter(Boolean));
  const noms = new Set((existants || []).map((p) => norme(p.nom)));
  const emails = new Set((existants || []).map((p) => (p.email || "").toLowerCase()).filter(Boolean));

  const aCreer = PARTNERS.filter((p) => !slugs.has(p.slug) && !noms.has(norme(p.name)));
  if (action === "apercu") {
    return NextResponse.json({
      ok: true,
      aCreer: aCreer.map((p) => ({ nom: p.name, slug: p.slug, email: p.email || null })),
      dejaPresents: PARTNERS.length - aCreer.length,
    });
  }

  const crees = [];
  const ignores = [];
  for (const p of aCreer) {
    const email = p.email && !emails.has(p.email.toLowerCase()) ? p.email.toLowerCase() : null;
    const { error: e } = await auth.admin.from("partenaires").insert({
      nom: p.name,
      slug: p.slug,
      email,
      telephone: p.phone || null,
      ...decouperAdresse(p.address),
      site_web: p.website || null,
      pin_code: genererPin(),
      active: true,
      created_by: auth.parent.id,
    });
    if (e) ignores.push({ nom: p.name, raison: e.message });
    else {
      crees.push(p.name);
      if (email) emails.add(email);
    }
  }
  return NextResponse.json({ ok: true, crees, ignores });
}
