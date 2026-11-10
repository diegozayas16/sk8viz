// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthActionResult } from '../hooks/useAuth.ts';
import { AuthPanel } from './AuthPanel.tsx';

afterEach(cleanup);

function setup(result: AuthActionResult | Error = { ok: true }) {
  const onEmail = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  render(createElement(AuthPanel, { onEmail }));
  const fill = (email: string, password: string) => {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  };
  return { onEmail, fill };
}

describe('AuthPanel', () => {
  it('offers email sign-in only (no Google button)', () => {
    setup();
    expect(screen.queryByText(/google/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('signs in with the typed email and password', async () => {
    const { onEmail, fill } = setup();
    fill('sk8@example.com', 'secret1');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onEmail).toHaveBeenCalledWith('sign_in', 'sk8@example.com', 'secret1'));
  });

  it('switches to account creation', async () => {
    const { onEmail, fill } = setup();
    fireEvent.click(screen.getByRole('button', { name: /create an account/i }));
    fill('new@example.com', 'secret1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(onEmail).toHaveBeenCalledWith('sign_up', 'new@example.com', 'secret1'));
  });

  it('shows the sign-in error and lets the user try again', async () => {
    const { fill } = setup({ ok: false, message: 'Invalid login credentials' });
    fill('sk8@example.com', 'wrong12');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid login credentials');
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('recovers when the sign-in service is unreachable', async () => {
    const { fill } = setup(new Error('fetch failed'));
    fill('sk8@example.com', 'secret1');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't reach/i);
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows a note when Supabase still asks for email confirmation', async () => {
    const { fill } = setup({ ok: true, note: 'Check your email to confirm your account, then sign in.' });
    fill('sk8@example.com', 'secret1');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/check your email/i);
  });
});
