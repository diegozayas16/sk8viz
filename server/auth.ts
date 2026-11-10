import { createClient } from '@supabase/supabase-js';

// Works out who sent a request from the Supabase access token in its
// `Authorization: Bearer <token>` header. Returns null for a missing, malformed,
// expired, or forged token; never throws.

export interface AuthUser {
  id: string;
}

export type AuthVerifier = (request: Request) => Promise<AuthUser | null>;

// Checks a token's signature and expiry and returns its claims, or null.
export type TokenVerifier = (token: string) => Promise<Record<string, unknown> | null>;

// Supabase access tokens are JWTs: three base64url parts separated by dots.
const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

export function bearerToken(request: Request): string | null {
  const match = BEARER.exec(request.headers.get('authorization')?.trim() ?? '');
  return match?.[1] ?? null;
}

export function createAuthVerifier(verifyToken: TokenVerifier): AuthVerifier {
  return async (request) => {
    const token = bearerToken(request);
    if (!token) return null;
    let claims: Record<string, unknown> | null;
    try {
      claims = await verifyToken(token);
    } catch {
      return null;
    }
    // Only real signed-in users: not the public "anon" role, not anonymous sign-ins.
    if (!claims || claims.role !== 'authenticated' || claims.is_anonymous === true) return null;
    return typeof claims.sub === 'string' && claims.sub !== '' ? { id: claims.sub } : null;
  };
}

// The real verifier. getClaims checks the token against the project's public
// signing keys (fetched once and cached), so most requests need no network call.
export function createSupabaseTokenVerifier(supabase: { url: string; publishableKey: string }): TokenVerifier {
  const client = createClient(supabase.url, supabase.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return async (token) => {
    const { data, error } = await client.auth.getClaims(token);
    if (error || !data) return null;
    return data.claims as Record<string, unknown>;
  };
}
