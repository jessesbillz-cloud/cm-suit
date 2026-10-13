// A home card's heading: its name and how many, so the number reads before the list. No number while it loads.
interface CountTitleProps {
  label: string;
  count: number | null;
  testId: string;
}

export function CountTitle({ label, count, testId }: CountTitleProps) {
  return (
    <span className="flex items-center gap-2">
      {label}
      {count === null ? null : (
        <span
          data-testid={testId}
          className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-page px-1.5 text-[12px] font-semibold tabular-nums text-ink-2 ring-1 ring-inset ring-line"
        >
          {String(count)}
        </span>
      )}
    </span>
  );
}
