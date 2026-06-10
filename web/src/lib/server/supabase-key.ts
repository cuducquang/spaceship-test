/**
 * Server side Supabase credentials. API routes and scripts prefer the secret
 * key (bypasses RLS, never shipped to the browser) and fall back to the
 * publishable key so the app still runs with a minimal configuration.
 */
export function getServerSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}
