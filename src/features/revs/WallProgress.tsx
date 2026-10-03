// A wall's tally as one slim bar (passed green, requested gold, failed red, the rest grey; lib/status colors) and,
// when asked, "12 of 21 passed" beside it.
import { countLine, type WallCount } from './wallPage';

interface WallProgressProps {
  count: WallCount;
  /** The words beside the bar. */
  withLine?: boolean | undefined;
  testId?: string | undefined;
}

const SEGMENTS = [
  ['passed', 'var(--status-approved-solid)'],
  ['requested', 'var(--status-pending-dot)'],
  ['failed', 'var(--status-not_approved-solid)'],
] as const;

export function WallProgress({ count, withLine = false, testId }: WallProgressProps) {
  const total = Math.max(count.needed, 1);
  const line = countLine(count);
  return (
    <div className="flex items-center gap-2.5" data-testid={testId} data-passed={count.passed} data-needed={count.needed}>
      <div className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line" role="img" aria-label={line} title={line}>
        {SEGMENTS.map(([key, color]) =>
          count[key] > 0 ? <span key={key} className="h-full" style={{ width: `${String((count[key] / total) * 100)}%`, background: color }} /> : null,
        )}
      </div>
      {withLine ? <span className="shrink-0 text-[13px] font-medium tabular-nums text-ink-2">{line}</span> : null}
    </div>
  );
}
