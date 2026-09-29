// The one segmented control look: a white pill track with a hairline edge; the picked segment in the accent tint.
// 36px tall, 14px labels. Tools switch views or filters with it (bids' Segmented uses the same classes). On a phone
// the row scrolls sideways instead of wrapping.

export const SEGMENT_TRACK =
  'inline-flex h-9 w-fit max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-full border border-line-strong/80 bg-card p-[3px] shadow-control [scrollbar-width:none]';

export function segmentClass(active: boolean): string {
  const base =
    'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed';
  return active
    ? `${base} bg-accent-soft font-medium text-accent shadow-[inset_0_0_0_1px_rgba(37,99,235,0.16)]`
    : `${base} text-ink-2 hover:bg-page/70 hover:text-ink`;
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
