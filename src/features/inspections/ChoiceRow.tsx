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
  /** Full width with 44px choices on a phone, compact from sm up (a choice on each row of a list). */
  responsive?: boolean | undefined;
}

function sizes(large: boolean, responsive: boolean): { track: string; choice: string } {
  if (large) return { track: 'flex w-full', choice: 'h-11 flex-1 text-base' };
  if (responsive) return { track: 'flex w-full sm:inline-flex sm:w-auto', choice: 'h-11 flex-1 text-sm sm:h-8 sm:flex-none' };
  return { track: 'inline-flex', choice: 'h-8 text-sm' };
}

export function ChoiceRow<T extends string>({ options, value, onPick, label, testId, disabled, large = false, responsive = false }: ChoiceRowProps<T>) {
  const size = sizes(large, responsive);
  return (
    <div role="radiogroup" aria-label={label} className={`flex-wrap rounded-md border border-line bg-card p-0.5 ${size.track}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          data-testid={testId ? `${testId}-${o.value}` : undefined}
          className={`rounded px-3 disabled:cursor-not-allowed ${size.choice} ${
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
