import { FlaskConical, Radio } from 'lucide-react';
import type { AnalysisMode } from '../types/analysis.ts';

interface ModeToggleProps {
  mode: AnalysisMode;
  onChange: (mode: AnalysisMode) => void;
  disabled?: boolean;
}

const OPTIONS = [
  { value: 'live', label: 'Live analysis', Icon: Radio },
  { value: 'demo', label: 'Demo data', Icon: FlaskConical },
] as const;

export function ModeToggle({ mode, onChange, disabled }: ModeToggleProps) {
  return (
    <fieldset className="flex gap-1 rounded-lg bg-zinc-900 p-1" disabled={disabled}>
      <legend className="sr-only">Analysis mode</legend>
      {OPTIONS.map(({ value, label, Icon }) => (
        <label
          key={value}
          className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lime-400 ${
            mode === value ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <input
            type="radio"
            name="analysis-mode"
            value={value}
            checked={mode === value}
            onChange={() => onChange(value)}
            className="sr-only"
          />
          <Icon aria-hidden="true" className="size-4" />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
