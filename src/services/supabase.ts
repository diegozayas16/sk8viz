import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The browser's connection to Supabase Auth. Both values are public by design:
// the publishable key only lets people sign up and sign in. It is null when the
// vars are missing (e.g. local dev without Supabase), and the app then works
// without accounts.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        // PKCE: Google sends back a one-time code (in ?code=) that only this
        // browser can exchange for a session, instead of a token in the URL.
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
