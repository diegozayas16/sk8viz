import type { LucideIcon } from 'lucide-react';

interface SegmentedControlProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  options: readonly { value: T; label: string; Icon: LucideIcon }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

// Accessible radio group styled as underlined tabs.
export function SegmentedControl<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  disabled,
}: SegmentedControlProps<T>) {
  return (
    <fieldset className="flex border-b border-line disabled:opacity-60" disabled={disabled}>
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={`-mb-px flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 whitespace-nowrap border-b-2 text-[15px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
            value === option.value
              ? 'border-accent font-bold text-ink'
              : 'border-transparent font-medium text-muted hover:text-ink'
          }`}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          <option.Icon aria-hidden="true" className="size-[18px]" />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
