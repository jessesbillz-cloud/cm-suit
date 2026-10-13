// The one segmented control look: a tinted pill track pressed into the card; the picked segment a raised white box in
// the accent color, the others lift to white under the pointer.
// 36px tall, 14px labels. Tools switch views or filters with it (bids' Segmented uses the same classes). On a phone
// the row scrolls sideways instead of wrapping.

export const SEGMENT_TRACK =
  'inline-flex h-9 w-fit max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-full border border-line-strong/80 bg-page p-[3px] shadow-[inset_0_1px_2px_rgba(16,24,40,.08)] [scrollbar-width:none]';

export function segmentClass(active: boolean): string {
  const base =
    'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm transition-[background-color,color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed';
  return active
    ? `${base} bg-card font-semibold text-accent shadow-tile`
    : `${base} text-ink-2 hover:bg-card/70 hover:text-ink active:bg-card`;
}

interface SegmentsProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
  /** What the group switches, for screen readers ("Deliveries", "Show"). */
  label: string;
  /** Each segment gets `${testId}-${value}`. */
  testId: string;
  /** Views are tabs; a filter is a radio group. */
  kind?: 'tabs' | 'radio' | undefined;
}

export function Segments<T extends string>({ options, value, onPick, label, testId, kind = 'tabs' }: SegmentsProps<T>) {
  const tabs = kind === 'tabs';
  return (
    <div role={tabs ? 'tablist' : 'radiogroup'} aria-label={label} className={SEGMENT_TRACK}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role={tabs ? 'tab' : 'radio'}
          aria-selected={tabs ? o.value === value : undefined}
          aria-checked={tabs ? undefined : o.value === value}
          data-testid={`${testId}-${o.value}`}
          className={segmentClass(o.value === value)}
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
