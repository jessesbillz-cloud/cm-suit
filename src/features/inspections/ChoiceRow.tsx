// A compact one-row choice (views, type, attendance, result, reason). Short labels only.
interface ChoiceRowProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onPick: (v: T) => void;
  label: string;
  testId?: string | undefined;
  disabled?: boolean | undefined;
}

export function ChoiceRow<T extends string>({ options, value, onPick, label, testId, disabled }: ChoiceRowProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-md border border-line bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          data-testid={testId ? `${testId}-${o.value}` : undefined}
          className={`h-8 rounded px-3 text-sm disabled:cursor-not-allowed ${
            o.value === value ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:text-ink'
          }`}
          onClick={() => {
            onPick(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
