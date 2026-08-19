import { createBrowserClient } from "@supabase/ssr";

// Client Supabase côté navigateur.
// Utilise uniquement la clé "publishable" (anon) : elle est protégée par les
// policies RLS définies dans supabase/migrations, jamais la clé secrète.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
