// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fake Supabase client: the hook only uses these auth methods.
type Listener = (event: string, session: { user: { email: string }; access_token: string } | null) => void;
let listener: Listener = () => {};
const unsubscribe = vi.fn();
const auth = {
  onAuthStateChange: vi.fn((cb: Listener) => {
    listener = cb;
    return { data: { subscription: { unsubscribe } } };
  }),
  signInWithPassword: vi.fn(async () => ({ error: null as { message: string } | null })),
  signUp: vi.fn(async () => ({ data: { session: {} as object | null }, error: null as { message: string } | null })),
  signOut: vi.fn(async () => ({ error: null })),
  getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok' } as { access_token: string } | null } })),
};
vi.mock('../services/supabase.ts', () => ({ supabase: { auth } }));

const { useAuth } = await import('./useAuth.ts');

beforeEach(() => vi.clearAllMocks());

describe('useAuth', () => {
  it('follows sign-in and sign-out events, and unsubscribes on unmount', () => {
    const { result, unmount } = renderHook(() => useAuth());
    expect(result.current.state).toEqual({ status: 'loading' });
    act(() => listener('SIGNED_IN', { user: { email: 'a@b.co' }, access_token: 't' }));
    expect(result.current.state).toEqual({ status: 'signed_in', email: 'a@b.co' });
    act(() => listener('SIGNED_OUT', null));
    expect(result.current.state).toEqual({ status: 'signed_out' });
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('trims the email and reports Supabase errors', async () => {
    const { result } = renderHook(() => useAuth());
    auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    const outcome = await result.current.signInWithEmail('sign_in', '  a@b.co ', 'pw1234');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw1234' });
    expect(outcome).toEqual({ ok: false, message: 'Invalid login credentials' });
  });

  it('signs up straight in when email confirmation is off, and asks to check email when on', async () => {
    const { result } = renderHook(() => useAuth());
    expect(await result.current.signInWithEmail('sign_up', 'a@b.co', 'pw1234')).toEqual({ ok: true });
    auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    expect(await result.current.signInWithEmail('sign_up', 'a@b.co', 'pw1234')).toMatchObject({ ok: true, note: expect.any(String) });
  });

  it('reads a fresh access token, or null when signed out', async () => {
    const { result } = renderHook(() => useAuth());
    expect(await result.current.getAccessToken()).toBe('tok');
    auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    expect(await result.current.getAccessToken()).toBeNull();
  });
});
