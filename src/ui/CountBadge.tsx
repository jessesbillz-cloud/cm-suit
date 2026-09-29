// The count on a rail item or phone tab: how many things there need me (lib/toolCounts). Accent pill, at most "9+";
// nothing at zero. Screen readers hear ", 3 need you" after the tool's name.
import { badgeText } from '../lib/toolCounts';

interface CountBadgeProps {
  n: number;
  testId: string;
  /** Placement and the ring that separates it from what's behind it. */
  className?: string | undefined;
}

export function CountBadge({ n, testId, className = '' }: CountBadgeProps) {
  if (n <= 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        data-testid={testId}
        data-count={n}
        className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold leading-none text-white tabular-nums ${className}`}
      >
        {badgeText(n)}
      </span>
      <span className="sr-only">{`, ${String(n)} need you`}</span>
    </>
  );
}
