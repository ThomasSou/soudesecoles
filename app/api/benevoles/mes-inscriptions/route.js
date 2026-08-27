import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

// Historique des créneaux bénévoles du parent connecté, tous événements
// confondus — affiché dans l'espace famille.
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const admin = createAdminClient();
  const { data: userData, error } = await admin.auth.getUser(accessToken);
  if (error || !userData?.user) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  const { data: parent } = await admin
    .from("parents")
    .select("id")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!parent) return NextResponse.json({ ok: true, inscriptions: [] });

  const { data: inscriptions, error: inscError } = await admin
    .from("benevolat_inscriptions")
    .select("id, creneau_id, created_at")
    .eq("parent_id", parent.id)
    .order("created_at", { ascending: false });

  if (inscError) return NextResponse.json({ error: inscError.message }, { status: 500 });
  if (!inscriptions || inscriptions.length === 0) return NextResponse.json({ ok: true, inscriptions: [] });

  const creneauIds = inscriptions.map((i) => i.creneau_id);
  const { data: creneaux } = await admin
    .from("benevolat_creneaux")
    .select("id, atelier_id, debut, fin")
    .in("id", creneauIds);

  const atelierIds = [...new Set((creneaux || []).map((c) => c.atelier_id))];
  const { data: ateliers } = await admin
    .from("benevolat_ateliers")
    .select("id, nom, evenement_id")
    .in("id", atelierIds);

  const evenementIds = [...new Set((ateliers || []).map((a) => a.evenement_id))];
  const { data: evenements } = await admin
    .from("benevolat_evenements")
    .select("id, nom")
    .in("id", evenementIds);

  const creneauById = Object.fromEntries((creneaux || []).map((c) => [c.id, c]));
  const atelierById = Object.fromEntries((ateliers || []).map((a) => [a.id, a]));
  const evenementById = Object.fromEntries((evenements || []).map((e) => [e.id, e]));

  return NextResponse.json({
    ok: true,
    inscriptions: inscriptions.map((i) => {
      const creneau = creneauById[i.creneau_id];
      const atelier = creneau ? atelierById[creneau.atelier_id] : null;
      const evenement = atelier ? evenementById[atelier.evenement_id] : null;
      return {
        id: i.id,
        debut: creneau?.debut || null,
        fin: creneau?.fin || null,
        atelierNom: atelier?.nom || "",
        evenementNom: evenement?.nom || "",
      };
    }),
  });
}
