// A wall's tally as one slim bar (signed off green, asked for blue, failed red, the rest grey; lib/status's card colors) and,
// when asked, "12 of 21 passed" beside it.
import { CARD_STATE } from '../../lib/status';
import { countLine, type WallCount } from './wallPage';

interface WallProgressProps {
  count: WallCount;
  /** The words beside the bar. */
  withLine?: boolean | undefined;
  testId?: string | undefined;
}

const SEGMENTS = [
  ['passed', `var(--status-${CARD_STATE.signed_off.key}-solid)`],
  ['requested', `var(--status-${CARD_STATE.asked_for.key}-solid)`],
  ['failed', `var(--status-${CARD_STATE.failed.key}-solid)`],
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
