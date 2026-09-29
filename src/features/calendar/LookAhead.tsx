// The week's construction look-ahead under the day (MDR's "Construction schedule"): the look-ahead lines of the
// selected day's week, Monday to Sunday, grouped by job. Shown only when the week has some.
import type { CalendarLine } from '../../data/calendar.types';
import { formatDay } from '../../lib/dates';
import type { LineEntry } from './entries';
import { LineRow } from './LineRow';
import { SectionTitle } from './SectionTitle';

interface LookAheadProps {
  week: readonly string[];
  entries: readonly LineEntry[];
  showJob: boolean;
  selectedId: string | null;
  onOpen: (line: CalendarLine) => void;
}

function byJob(entries: readonly LineEntry[]): { projectId: string; name: string; entries: LineEntry[] }[] {
  const out: { projectId: string; name: string; entries: LineEntry[] }[] = [];
  for (const e of entries) {
    const group = out.find((g) => g.projectId === e.projectId);
    if (group) group.entries.push(e);
    else out.push({ projectId: e.projectId, name: e.projectName, entries: [e] });
  }
  return out;
}

export function LookAhead({ week, entries, showJob, selectedId, onOpen }: LookAheadProps) {
  const first = week[0];
  const last = week[week.length - 1];
  if (entries.length === 0 || first === undefined || last === undefined) return null;
  const range = `${formatDay(first, 'MMM d')} – ${formatDay(last, first.slice(0, 7) === last.slice(0, 7) ? 'd' : 'MMM d')}`;
  return (
    <section data-testid="cal-lookahead" aria-label="Look-ahead">
      <SectionTitle label="Look-ahead" count={range} />
      <div className="flex flex-col gap-3">
        {byJob(entries).map((g) => (
          <div key={g.projectId} className="overflow-hidden rounded-lg border border-line">
            {showJob ? <p className="border-b border-line bg-card-head px-4 py-2 text-[13px] font-semibold text-ink">{g.name}</p> : null}
            <div className="divide-y divide-line">
              {g.entries.map((e) => (
                <LineRow key={e.key} line={e.line} showJob={false} selected={e.line.id === selectedId} timeLabel={formatDay(e.day, 'EEE d')} onOpen={onOpen} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
