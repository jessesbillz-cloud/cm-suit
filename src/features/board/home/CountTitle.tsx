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
          className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-[5px] bg-ink px-1.5 font-sans text-[13px] font-bold tabular-nums tracking-normal text-white"
        >
          {String(count)}
        </span>
      )}
    </span>
  );
}
