// The one segmented control look: a tinted track with a crisp edge, pressed into the card; the picked segment a raised
// black box with white words, the others lift to white under the pointer. Words in the display face (Oct 23).
// 36px tall. Tools switch views or filters with it (bids' Segmented uses the same classes). On a phone
// the row scrolls sideways instead of wrapping.

export const SEGMENT_TRACK =
  'inline-flex h-9 w-fit max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-md border-[1.5px] border-ink bg-card-head p-[2px] shadow-[inset_0_1px_2px_rgba(16,18,20,.10)] [scrollbar-width:none]';

export function segmentClass(active: boolean): string {
  const base =
    'heading inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-3.5 text-[13px] font-medium tracking-[0.06em] transition-[background-color,color,box-shadow] duration-150 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed';
  return active
    ? `${base} bg-ink text-white shadow-primary`
    : `${base} text-ink-2 hover:bg-card hover:text-ink hover:shadow-tile active:bg-card`;
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
