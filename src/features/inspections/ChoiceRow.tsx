// A compact one-row choice (views, type, attendance, result, reason). Short labels only.
interface ChoiceRowProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onPick: (v: T) => void;
  label: string;
  testId?: string | undefined;
  disabled?: boolean | undefined;
  /** Full width, 44px choices (field screens on a phone). */
  large?: boolean | undefined;
}

export function ChoiceRow<T extends string>({ options, value, onPick, label, testId, disabled, large = false }: ChoiceRowProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex-wrap rounded-md border border-line bg-card p-0.5 ${large ? 'flex w-full' : 'inline-flex'}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          data-testid={testId ? `${testId}-${o.value}` : undefined}
          className={`rounded px-3 disabled:cursor-not-allowed ${large ? 'h-11 flex-1 text-base' : 'h-8 text-sm'} ${
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
