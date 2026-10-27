import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Resolves an access token to a verified user id, or null if unverifiable. */
export type TokenVerifier = (token: string) => Promise<string | null>;

/** Returns a verifier backed by Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, else null. */
export function createSupabaseVerifier(env: NodeJS.ProcessEnv = process.env): TokenVerifier | null {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  let client: SupabaseClient;
  try {
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  } catch (err) {
    console.warn('[auth] failed to create Supabase client; running guest-only', err);
    return null;
  }
  return async (token) => {
    try {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data?.user) return null;
      return data.user.id;
    } catch {
      return null;
    }
  };
}
