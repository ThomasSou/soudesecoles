import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/adminAuth";
import { currentSchoolYear } from "../../../../lib/anneeScolaire";
import { lireListeEcole, rapprocherNiveaux, cleNom } from "../../../../lib/niveauxEleves";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_OCTETS = 5 * 1024 * 1024;
const NIVEAUX_OK = ["CP", "CE1", "CE2", "CM1", "CM2"];
const CLASSE_OK = /^(CP|CE1|CE2|CM1|CM2)(-(CP|CE1|CE2|CM1|CM2))?$/;

// Importe les niveaux individuels (CP, CE1, CE2, CM1, CM2) depuis la « Liste
// simple des élèves par classe » de l'école (PDF).
//  - appliquer = false : simple aperçu, rien n'est écrit ;
//  - appliquer = true  : le rapprochement est refait côté serveur à partir du
//    même PDF (jamais de liste d'identifiants envoyée par le navigateur) puis
//    le niveau est écrit ; alignerClasse recale aussi la classe sur la liste.
// Le PDF n'est pas conservé et la date de naissance / le sexe sont ignorés.
export async function POST(request) {
  const auth = await requirePermission(request, "familles");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  // Deux entrées possibles :
  //  - `eleves` : liste déjà lue (fichier .json préparé à partir du PDF) —
  //    solution de secours, la lecture de PDF échouant sur l'hébergement ;
  //  - `pdfDataUrl` : le PDF de l'école, lu ici.
  let eleves;
  if (Array.isArray(body?.eleves)) {
    eleves = body.eleves
      .slice(0, 1000)
      .filter((e) => e && typeof e.brut === "string" && NIVEAUX_OK.includes(e.niveau))
      .map((e) => ({
        brut: e.brut.slice(0, 120),
        cle: cleNom(e.brut),
        niveau: e.niveau,
        classe: typeof e.classe === "string" && CLASSE_OK.test(e.classe) ? e.classe : null,
      }))
      .filter((e) => e.cle);
  } else {
    const m = /^data:application\/pdf;base64,(.+)$/.exec(body?.pdfDataUrl || "");
    if (!m) return NextResponse.json({ error: "Déposez la liste de l'école (PDF ou fichier .json préparé)." }, { status: 400 });
    const octets = Buffer.from(m[1], "base64");
    if (octets.length === 0 || octets.length > MAX_OCTETS) {
      return NextResponse.json({ error: "PDF vide ou trop lourd (5 Mo maximum)." }, { status: 400 });
    }
    let texte;
    try {
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      texte = (await pdfParse(octets)).text;
    } catch (e) {
      return NextResponse.json(
        { error: `Lecture du PDF impossible sur le serveur (${String(e?.message || e).slice(0, 160)}). Utilisez le fichier .json préparé à la place.` },
        { status: 422 }
      );
    }
    eleves = lireListeEcole(texte);
  }
  if (eleves.length === 0) {
    return NextResponse.json(
      { error: "Aucun élève reconnu dans ce fichier." },
      { status: 400 }
    );
  }

  const annee = currentSchoolYear();
  const { data: enfants, error } = await auth.admin
    .from("children")
    .select("id, first_name, last_name, class_level, niveau, school_year")
    .eq("school_year", annee);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const r = rapprocherNiveaux(eleves, enfants || []);
  const nomEnfant = (c) => `${c.first_name} ${c.last_name}`.trim();

  if (!body.appliquer) {
    return NextResponse.json({
      ok: true,
      apercu: true,
      annee,
      dansLaListe: eleves.length,
      aMettreAJour: r.maj.length,
      dejaAJour: r.dejaAJour.length,
      nonRetrouves: r.nonRetrouves.length,
      ambigus: r.ambigus.length,
      classeDifferente: r.classeDifferente.slice(0, 40).map((e) => ({
        nom: nomEnfant(e.enfant),
        classeSite: e.enfant.class_level,
        classeListe: e.classeListe,
      })),
      nbClasseDifferente: r.classeDifferente.length,
      elementairesAbsents: r.elementairesAbsents.slice(0, 40).map((c) => ({ nom: nomEnfant(c), classe: c.class_level })),
      nbElementairesAbsents: r.elementairesAbsents.length,
    });
  }

  // Application : un seul enfant à la fois, par lots, avec leur niveau.
  const aEcrire = body.alignerClasse
    ? [...r.maj, ...r.dejaAJour.filter((e) => e.classeListe && e.enfant.class_level !== e.classeListe)]
    : r.maj;
  let ecrits = 0;
  for (let i = 0; i < aEcrire.length; i += 20) {
    const lot = aEcrire.slice(i, i + 20);
    const resultats = await Promise.all(
      lot.map((e) => {
        const maj = { niveau: e.niveau };
        if (body.alignerClasse && e.classeListe) maj.class_level = e.classeListe;
        return auth.admin.from("children").update(maj).eq("id", e.enfant.id);
      })
    );
    const erreur = resultats.find((x) => x.error);
    if (erreur) {
      return NextResponse.json(
        { error: `Arrêt après ${ecrits} enfant(s) : ${erreur.error.message}`, ecrits },
        { status: 500 }
      );
    }
    ecrits += lot.length;
  }
  return NextResponse.json({ ok: true, applique: true, ecrits, nonRetrouves: r.nonRetrouves.length });
}
