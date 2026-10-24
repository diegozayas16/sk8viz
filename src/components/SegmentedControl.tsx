import type { LucideIcon } from 'lucide-react';

interface SegmentedControlProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  options: readonly { value: T; label: string; Icon: LucideIcon }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

// Accessible radio group styled as a pill switch.
export function SegmentedControl<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  disabled,
}: SegmentedControlProps<T>) {
  return (
    <fieldset className="flex gap-1 rounded-lg bg-zinc-900 p-1" disabled={disabled}>
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lime-400 ${
            value === option.value ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
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
          <option.Icon aria-hidden="true" className="size-4" />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
