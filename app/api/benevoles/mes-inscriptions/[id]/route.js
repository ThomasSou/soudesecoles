import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabaseServerAdmin";

export const dynamic = "force-dynamic";

// Permet à un parent connecté de se désinscrire d'un créneau qu'il avait
// pris. Ne supprime que ses propres inscriptions (vérifié via le jeton,
// jamais via un id envoyé tel quel).
export async function DELETE(request, { params }) {
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
  if (!parent) return NextResponse.json({ error: "Profil introuvable." }, { status: 404 });

  const { error: deleteError } = await admin
    .from("benevolat_inscriptions")
    .delete()
    .eq("id", params.id)
    .eq("parent_id", parent.id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
