import { KeyRound } from 'lucide-react';
import { useId } from 'react';

interface AccessCodeFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

// Shown only when the server requires an access code for live analysis. The
// code is kept in memory only, never in browser storage.
export function AccessCodeField({ value, onChange, disabled }: AccessCodeFieldProps) {
  const inputId = useId();
  const hintId = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="flex items-center gap-2 text-sm font-medium text-zinc-300">
        <KeyRound aria-hidden="true" className="size-4 text-lime-400" />
        Access code
      </label>
      <input
        id={inputId}
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        autoComplete="off"
        aria-describedby={hintId}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-lime-400 focus-visible:outline-none disabled:opacity-50"
        placeholder="Enter the code you were given"
      />
      <p id={hintId} className="text-xs text-zinc-500">
        Live analysis is limited right now. Ask the Sk8viz team for a code, or see an example below.
      </p>
    </div>
  );
}
