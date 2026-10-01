// Where the RFI is, at the top of its pane: the same route strip as its log row, then one short line only when it says
// something the strip doesn't: it is with you, the person who has it hasn't opened it, when the answer is due (red once
// late).
import type { RfiDetail, RfiProgressRow } from '../../data/rfis.types';
import { StatusChip } from '../../ui/StatusChip';
import { dueText, notOpened } from './model';
import { RouteStrip } from './RouteStrip';

interface RfiWhereProps {
  detail: RfiDetail;
  /** This RFI's steps; undefined while they load. */
  steps: readonly RfiProgressRow[] | undefined;
  timeZone: string;
  now: Date;
  layout: 'line' | 'stack';
}

export function RfiWhere({ detail, steps, timeZone, now, layout }: RfiWhereProps) {
  const r = detail.rfi;
  const due = r.status === 'open' && r.due_at !== null ? dueText(r.due_at, timeZone, now) : null;
  const unopened = !detail.is_mine_to_act && notOpened(r);
  return (
    <section className="flex flex-col gap-2" aria-label="Where it is" data-testid="rfi-where">
      {steps ? (
        <RouteStrip steps={steps} timeZone={timeZone} mine={detail.is_mine_to_act} layout={layout} />
      ) : (
        <span aria-hidden className={`block w-full animate-pulse rounded-[5px] bg-page ${layout === 'stack' ? 'h-[34px]' : 'h-6'}`} />
      )}
      {detail.is_mine_to_act || unopened || due ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
          {detail.is_mine_to_act ? (
            <span className="font-semibold text-accent" data-testid="rfi-holder">
              With you
            </span>
          ) : null}
          {unopened ? <StatusChip status="pending" label="Not opened" /> : null}
          {due ? (
            <span
              data-testid="rfi-due"
              className={due.late ? 'font-semibold' : ''}
              style={due.late ? { color: 'var(--status-late-fg)' } : undefined}
            >
              {due.text}
            </span>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
