import { createClient } from "@supabase/supabase-js";

// Client Supabase cote serveur UNIQUEMENT (route API / server actions).
// Utilise la cle secrete (service role) : ne jamais importer ce fichier
// dans un composant "use client" ni l'exposer au navigateur.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
