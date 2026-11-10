import { describe, expect, it } from 'vitest';
import { bearerToken, createAuthVerifier, type TokenVerifier } from './auth.ts';

const TOKEN = 'aaa.bbb.ccc';
const request = (authorization?: string) =>
  new Request('http://localhost/api/analyze', authorization ? { headers: { Authorization: authorization } } : {});

const claimsFor =
  (claims: Record<string, unknown> | null): TokenVerifier =>
  async (token) =>
    token === TOKEN ? claims : null;

const signedIn = { sub: 'user-1', role: 'authenticated', is_anonymous: false };

describe('bearerToken', () => {
  it('reads only a well-formed Bearer JWT', () => {
    expect(bearerToken(request(`Bearer ${TOKEN}`))).toBe(TOKEN);
    expect(bearerToken(request())).toBeNull();
    expect(bearerToken(request(`Basic ${TOKEN}`))).toBeNull();
    expect(bearerToken(request('Bearer not-a-jwt'))).toBeNull();
    expect(bearerToken(request(`Bearer ${TOKEN} extra`))).toBeNull();
  });
});

describe('createAuthVerifier', () => {
  it('returns the user for a verified token', async () => {
    expect(await createAuthVerifier(claimsFor(signedIn))(request(`Bearer ${TOKEN}`))).toEqual({ id: 'user-1' });
  });

  it('rejects missing, unverified, and throwing tokens', async () => {
    const verify = createAuthVerifier(claimsFor(signedIn));
    expect(await verify(request())).toBeNull();
    expect(await verify(request('Bearer xxx.yyy.zzz'))).toBeNull();
    const throwing = createAuthVerifier(async () => {
      throw new Error('jwks unreachable');
    });
    expect(await throwing(request(`Bearer ${TOKEN}`))).toBeNull();
  });

  it('rejects the public anon key, anonymous users, and tokens without a user ID', async () => {
    const check = (claims: Record<string, unknown>) => createAuthVerifier(claimsFor(claims))(request(`Bearer ${TOKEN}`));
    expect(await check({ role: 'anon' })).toBeNull();
    expect(await check({ ...signedIn, is_anonymous: true })).toBeNull();
    expect(await check({ ...signedIn, sub: '' })).toBeNull();
    expect(await check({ role: 'authenticated' })).toBeNull();
  });
});
