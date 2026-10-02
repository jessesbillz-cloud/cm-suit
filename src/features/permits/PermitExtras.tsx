// The permit page's last piece, in the full view only: the stage history (who moved it and when; an undone move shows
// struck through).
import type { PermitEvent } from '../../data/permits.types';
import { formatInZone } from '../../lib/dates';
import { stageLabel } from './model';

export function PermitHistory({ events, timeZone }: { events: readonly PermitEvent[]; timeZone: string }) {
  return (
    <section className="flex flex-col gap-1.5" data-testid="permit-history">
      <h2 className="text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-ink-3">History</h2>
      <ol className="flex flex-col gap-1 text-[13px] leading-5">
        {[...events].reverse().map((e, i) => (
          <li key={`${e.at}-${String(i)}`} className={`flex gap-2 ${e.undone ? 'text-ink-3 line-through' : 'text-ink-2'}`}>
            <span className="w-28 shrink-0 tabular-nums">{formatInZone(e.at, timeZone, 'MMM d, yyyy')}</span>
            <span className="min-w-0 flex-1 break-words">
              <span className={e.undone ? '' : 'font-medium text-ink'}>{stageLabel(e.stage)}</span>
              {e.by_name ? ` · ${e.by_name}` : ''}
              {e.note ? ` · ${e.note}` : ''}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
