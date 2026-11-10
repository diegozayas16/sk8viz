import { Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import type { AuthActionResult } from '../hooks/useAuth.ts';

interface AuthPanelProps {
  onEmail: (mode: 'sign_in' | 'sign_up', email: string, password: string) => Promise<AuthActionResult>;
  disabled?: boolean;
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const INPUT =
  'min-h-12 w-full border border-edge bg-surface px-3 text-ink placeholder:text-dim focus-visible:border-accent focus-visible:outline-none disabled:opacity-50';

// Shown to signed-out visitors when live analysis needs an account.
export function AuthPanel({ onEmail, disabled }: AuthPanelProps) {
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'note'; text: string } | null>(null);
  const emailId = useId();
  const passwordId = useId();
  const locked = disabled || busy;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    let result: AuthActionResult;
    try {
      result = await onEmail(mode, email, password);
    } catch {
      result = { ok: false, message: "Couldn't reach the sign-in service. Check your connection and try again." };
    }
    setBusy(false);
    if (!result.ok) setMessage({ kind: 'error', text: result.message });
    else if (result.note) setMessage({ kind: 'note', text: result.note });
  };

  return (
    <div className="flex flex-col gap-4 border border-edge p-5">
      <p className="eyebrow">Sign in to analyze your clip</p>

      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <label htmlFor={emailId} className="sr-only">
          Email
        </label>
        <input
          id={emailId}
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={locked}
          className={INPUT}
        />
        <label htmlFor={passwordId} className="sr-only">
          Password
        </label>
        <input
          id={passwordId}
          type="password"
          required
          minLength={6}
          autoComplete={mode === 'sign_up' ? 'new-password' : 'current-password'}
          placeholder={mode === 'sign_up' ? 'Password (6+ characters)' : 'Password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={locked}
          className={INPUT}
        />
        <button
          type="submit"
          disabled={locked}
          className={`flex min-h-12 items-center justify-center gap-2 bg-ink px-4 font-semibold text-ground hover:bg-body disabled:opacity-50 ${FOCUS}`}
        >
          {busy && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          {mode === 'sign_up' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in');
          setMessage(null);
        }}
        disabled={locked}
        className={`min-h-11 self-start text-left text-sm underline underline-offset-4 hover:text-white disabled:opacity-50 ${FOCUS}`}
      >
        {mode === 'sign_in' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>

      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${message.kind === 'error' ? 'text-danger' : 'text-body'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
