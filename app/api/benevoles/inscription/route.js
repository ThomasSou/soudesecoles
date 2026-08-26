import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

// Inscrit un bénévole sur un ou plusieurs créneaux en une fois. Aucun
// compte requis. La place restante est revérifiée ici, jamais fiée à ce
// qu'affichait la page (elle a pu se remplir entre-temps).
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const creneauIds = Array.isArray(body?.creneauIds) ? [...new Set(body.creneauIds)] : [];
  const firstName = body?.firstName?.trim();
  const lastName = body?.lastName?.trim();
  const email = body?.email?.trim();
  const phone = body?.phone?.trim();

  if (creneauIds.length === 0) {
    return NextResponse.json({ error: "Choisissez au moins un créneau." }, { status: 400 });
  }
  if (!firstName || !lastName || !email || !phone) {
    return NextResponse.json(
      { error: "Merci d'indiquer votre nom, prénom, e-mail et téléphone." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Acheteur connecté ? (facultatif — retrouvé via le jeton, jamais via le
  // corps de la requête). Sert à rattacher l'inscription au compte famille
  // pour qu'elle apparaisse dans son historique.
  let parentId = null;
  let familyId = null;
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (accessToken) {
    const { data: userData } = await admin.auth.getUser(accessToken);
    if (userData?.user) {
      const { data: parent } = await admin
        .from("parents")
        .select("id, family_id")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (parent) {
        parentId = parent.id;
        familyId = parent.family_id;
      }
    }
  }

  const { data: creneaux, error: creneauxError } = await admin
    .from("benevolat_creneaux")
    .select("id, places")
    .in("id", creneauIds);

  if (creneauxError) return NextResponse.json({ error: creneauxError.message }, { status: 500 });

  const { data: inscriptionsExistantes } = await admin
    .from("benevolat_inscriptions")
    .select("creneau_id")
    .in("creneau_id", creneauIds);

  const inscritsParCreneau = {};
  for (const i of inscriptionsExistantes || []) {
    inscritsParCreneau[i.creneau_id] = (inscritsParCreneau[i.creneau_id] || 0) + 1;
  }

  const complets = [];
  const aInserer = [];
  for (const c of creneaux || []) {
    const restantes = c.places - (inscritsParCreneau[c.id] || 0);
    if (restantes <= 0) complets.push(c.id);
    else
      aInserer.push({
        creneau_id: c.id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        parent_id: parentId,
        family_id: familyId,
      });
  }

  if (aInserer.length === 0) {
    return NextResponse.json(
      { error: "Ce ou ces créneaux viennent d'être complétés par quelqu'un d'autre. Merci de recharger la page." },
      { status: 409 }
    );
  }

  const { error: insertError } = await admin.from("benevolat_inscriptions").insert(aInserer);

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "Vous êtes déjà inscrit·e sur au moins un de ces créneaux." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inscrits: aInserer.length,
    complets: complets.length,
  });
}
