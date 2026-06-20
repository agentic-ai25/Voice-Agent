import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client using the service-role key. NEVER import this from
 * a client component — the service-role key bypasses RLS and must stay on the
 * server. The dashboard fetches all data in server components / route handlers.
 */
let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export function isConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
