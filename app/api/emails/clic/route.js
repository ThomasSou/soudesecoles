import { NextResponse } from "next/server";
import { incrementerStat } from "../../../lib/stats";

export const dynamic = "force-dynamic";

// Redirection comptabilisée : les liens des e-mails passent par ici, on
// enregistre le clic puis on renvoie immédiatement le lecteur vers sa
// destination. Seule l'URL de destination est conservée, jamais qui a cliqué.
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const destination = params.get("u");
  const envoi = params.get("e");

  let cible;
  try {
    cible = new URL(destination);
    // On n'accepte que http(s) : évite qu'un lien forgé serve de tremplin.
    if (cible.protocol !== "http:" && cible.protocol !== "https:") throw new Error();
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }

  await incrementerStat("email_clic", (envoi ? `${envoi} · ` : "") + cible.origin + cible.pathname);

  return NextResponse.redirect(cible.toString());
}
