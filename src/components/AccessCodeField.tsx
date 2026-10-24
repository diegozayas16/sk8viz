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
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="eyebrow">
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
        className="min-h-12 w-full border border-edge bg-surface px-3 text-ink placeholder:text-dim focus-visible:border-accent focus-visible:outline-none disabled:opacity-50"
        placeholder="Enter the code you were given"
      />
      <p id={hintId} className="text-[13px] text-dim">
        Live analysis is limited right now. Ask the Sk8viz team for a code, or see an example below.
      </p>
    </div>
  );
}
