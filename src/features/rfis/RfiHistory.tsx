// An RFI's history, behind one link in the pane: what happened, who, when, and the note. Oldest first.
import type { RfiEvent } from '../../data/rfis.types';
import { formatInZone } from '../../lib/dates';
import { EVENT_LABELS } from './model';

interface RfiHistoryProps {
  events: readonly RfiEvent[];
  timeZone: string;
}

export function RfiHistory({ events, timeZone }: RfiHistoryProps) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-4" aria-label="History" data-testid="rfi-history">
      <h2 className="text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-ink-3">History</h2>
      <ol className="flex flex-col gap-3">
        {events.map((e, i) => (
          <li key={`${e.at}-${String(i)}`} className="flex flex-col gap-0.5">
            <p className="text-sm text-ink">
              <span className="font-medium">{EVENT_LABELS[e.kind]}</span>
              <span className="text-ink-2">
                {' '}
                &middot; {e.actor_name ?? 'System'} &middot; {formatInZone(e.at, timeZone, 'MMM d, yyyy h:mm a')}
              </span>
            </p>
            {e.note ? <p className="whitespace-pre-wrap break-words text-sm text-ink-2">{e.note}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
