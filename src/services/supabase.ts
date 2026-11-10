import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseProjectUrl } from '../../shared/auth/supabaseUrl.ts';

// The browser's connection to Supabase Auth. Both values are public by design:
// the publishable key only lets people sign up and sign in. It is null when the
// vars are missing (e.g. local dev without Supabase), and the app then works
// without accounts.
const url = supabaseProjectUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        // Keep the session in this browser and renew the token before it expires.
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;
