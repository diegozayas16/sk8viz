import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase.ts';

export type AuthState =
  // Supabase isn't configured in this build.
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; email: string | null };

// Result of a sign-in action: an error to show, or a note (e.g. "check your email").
export type AuthActionResult = { ok: true; note?: string } | { ok: false; message: string };

// Tracks whether someone is signed in and exposes the sign-in actions.
// The session itself lives inside the Supabase client (saved in localStorage
// and refreshed automatically); this hook only mirrors who is signed in.
export function useAuth() {
  const [state, setState] = useState<AuthState>(supabase ? { status: 'loading' } : { status: 'unavailable' });

  useEffect(() => {
    if (!supabase) return;
    // Fires once right away with the stored session (INITIAL_SESSION), then on
    // every sign-in, sign-out, and token refresh.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: 'signed_in', email: session.user.email ?? null } : { status: 'signed_out' });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signInWithEmail = useCallback(
    async (mode: 'sign_in' | 'sign_up', email: string, password: string): Promise<AuthActionResult> => {
      if (!supabase) return { ok: false, message: 'Sign-in is not set up.' };
      const credentials = { email: email.trim(), password };
      if (mode === 'sign_in') {
        const { error } = await supabase.auth.signInWithPassword(credentials);
        return error ? { ok: false, message: error.message } : { ok: true };
      }
      const { data, error } = await supabase.auth.signUp(credentials);
      if (error) return { ok: false, message: error.message };
      // No session means Supabase wants the email confirmed first.
      return data.session ? { ok: true } : { ok: true, note: 'Check your email to confirm your account, then sign in.' };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  // Read fresh at request time: getSession refreshes an expired token first.
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  return { state, signInWithEmail, signOut, getAccessToken };
}
