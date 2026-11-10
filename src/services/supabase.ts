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
        // Keep the session in this browser and renew the token before it expires.
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;
