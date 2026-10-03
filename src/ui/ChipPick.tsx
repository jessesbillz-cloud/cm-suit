// Tap-to-pick buttons that wrap, the way My Daily Reports lays out a Special inspection's kinds (Soils, Concrete,
// Masonry, Grout ...): each button says what it is, a tap picks it, a second tap drops it. One pick or several (with a
// cap). A button can carry a small mark before its name (a status dot, a color swatch) and can be done (shown, not
// pickable). Big targets on the phone.
import type { ReactNode } from 'react';

export interface Chip<T extends string> {
  value: T;
  label: string;
  /** Before the name: a status dot or a color swatch. */
  mark?: ReactNode;
  /** Shown but not pickable (e.g. already passed). */
  done?: boolean | undefined;
  /** Hover text. */
  title?: string | undefined;
}

interface ChipPickProps<T extends string> {
  chips: readonly Chip<T>[];
  picked: readonly T[];
  onChange: (picked: T[]) => void;
  label: string;
  /** One pick (a new tap replaces it) or several. */
  multiple?: boolean | undefined;
  /** With multiple: at most this many; the rest wait until one is dropped. */
  max?: number | undefined;
  testId?: string | undefined;
}

/** The next picked list after a tap on `value`. */
export function nextPicked<T extends string>(picked: readonly T[], value: T, multiple: boolean, max: number): T[] {
  if (picked.includes(value)) return picked.filter((v) => v !== value);
  if (!multiple) return [value];
  return picked.length >= max ? [...picked] : [...picked, value];
}

export function ChipPick<T extends string>({ chips, picked, onChange, label, multiple = false, max = Infinity, testId }: ChipPickProps<T>) {
  const full = multiple && picked.length >= max;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5" data-testid={testId}>
      {chips.map((c) => {
        const on = picked.includes(c.value);
        const blocked = c.done === true || (full && !on);
        return (
          <button
            key={c.value}
            type="button"
            aria-pressed={on}
            disabled={blocked}
            title={c.title}
            data-testid={testId ? `${testId}-${c.value}` : undefined}
            data-done={c.done ? 'true' : undefined}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-left text-sm font-medium wrap-anywhere sm:min-h-9 ${
              on
                ? 'border-accent bg-accent text-white'
                : c.done
                  ? 'cursor-default border-line bg-card-head text-ink-3'
                  : 'border-line bg-card text-ink hover:border-line-strong disabled:cursor-not-allowed disabled:text-ink-3'
            }`}
            onClick={() => {
              onChange(nextPicked(picked, c.value, multiple, max));
            }}
          >
            {c.mark}
            <span>{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}
