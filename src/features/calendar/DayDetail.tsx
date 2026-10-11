// The open day, right under its week in the month (MDR's day panel; ui/MonthCalendar): the weekday over the date and
// the day's count, Add and Block time, the day's requests by state (each a card that opens in the right column with
// the inspector's steps), blocked time, the day's other lines under their kind (Deliveries, Meetings, Milestones,
// Due ...), then the week's look-ahead. A day with none of that and nothing to add opens nothing (dayHasPanel).
import { CalendarOff, Plus } from 'lucide-react';
import type { CalendarLine } from '../../data/calendar.types';
import { kindLabel } from '../../lib/calendarKinds';
import { formatDay } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { BlockRow } from './BlockRow';
import { dayCount, GROUP_LABELS, groupRequests, isLookahead, type Entry, type IrEntry, type LineEntry } from './entries';
import { LineRow } from './LineRow';
import { LookAhead } from './LookAhead';
import { requestItemId } from './model';
import { RequestCard } from './RequestCard';
import { SectionTitle } from './SectionTitle';

interface DayDetailProps {
  day: string;
  today: string;
  entries: readonly Entry[];
  /** The Monday-to-Sunday week of the day, and its look-ahead lines. */
  week: readonly string[];
  lookahead: readonly LineEntry[];
  showJob: boolean;
  /** The right column's item (a request or a line), to mark it. */
  openId: string | null;
  isPhone: boolean;
  onAdd: (() => void) | null;
  onBlock: (() => void) | null;
  onOpenRequest: (entry: IrEntry) => void;
  onOpenLine: (line: CalendarLine) => void;
}

function Header({ day, today, entries, isPhone, onAdd, onBlock }: Pick<DayDetailProps, 'day' | 'today' | 'entries' | 'isPhone' | 'onAdd' | 'onBlock'>) {
  const count = dayCount(entries);
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 pt-3 sm:px-4">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
          {formatDay(day, 'EEEE')}
          {day === today ? <span className="text-accent"> · Today</span> : null}
        </p>
        <h2 data-testid="cal-day-title" className="text-lg font-semibold leading-6 text-ink">
          {formatDay(day, 'MMMM d')}
        </h2>
        {count ? <p className="text-[13px] text-ink-2">{count}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        {onBlock ? (
          <Button icon={CalendarOff} className={isPhone ? 'h-11' : ''} data-testid="cal-block-time" onClick={onBlock}>
            Block time
          </Button>
        ) : null}
        {onAdd ? (
          <Button variant="primary" icon={Plus} className={isPhone ? 'h-11' : ''} data-testid={`cal-add-${day}`} onClick={onAdd}>
            Add
          </Button>
        ) : null}
      </div>
    </header>
  );
}

/** The day's other lines by kind, in the order the kinds first appear (the day's order). */
function byKind(entries: readonly LineEntry[]): { kind: string; entries: LineEntry[] }[] {
  const out: { kind: string; entries: LineEntry[] }[] = [];
  for (const e of entries) {
    const group = out.find((g) => g.kind === e.line.kind);
    if (group) group.entries.push(e);
    else out.push({ kind: e.line.kind, entries: [e] });
  }
  return out;
}

/** Section words: the kind's label, shortened where the filter's longer name reads oddly as a heading. */
const HEADINGS: Record<string, string> = { my_due: 'Due' };

/** Whether the open day shows anything under its week: its lines, the week's look-ahead, or Add / Block time. */
export function dayHasPanel(p: Pick<DayDetailProps, 'entries' | 'lookahead' | 'onAdd' | 'onBlock'>): boolean {
  return p.entries.length > 0 || p.lookahead.length > 0 || p.onAdd !== null || p.onBlock !== null;
}

export function DayDetail(props: DayDetailProps) {
  const { day, entries, week, lookahead, showJob, openId, onOpenRequest, onOpenLine } = props;
  const requests = entries.filter((e): e is IrEntry => e.type === 'ir');
  const others = entries.filter((e): e is LineEntry => e.type === 'line' && !isLookahead(e));
  const groups = groupRequests(requests);
  return (
    <section data-testid="cal-day-detail" aria-label={formatDay(day, 'EEEE, MMMM d')}>
      <Header {...props} />
      <div className="flex flex-col gap-5 p-3 sm:p-4">
        {groups.map((g) => (
          <section key={g.group} data-testid={`cal-group-${g.group}`}>
            <SectionTitle label={GROUP_LABELS[g.group]} count={g.entries.length} />
            <div className="flex flex-col gap-2.5">
              {g.entries.map((e) =>
                g.group === 'blocked' ? (
                  <BlockRow key={e.key} entry={e} showJob={showJob} />
                ) : (
                  <RequestCard
                    key={e.key}
                    entry={e}
                    showJob={showJob}
                    selected={e.row.id !== null && openId === requestItemId(e.projectId, e.row.id)}
                    done={g.group === 'done'}
                    onOpen={onOpenRequest}
                  />
                ),
              )}
            </div>
          </section>
        ))}
        {others.length > 0 ? (
          <div data-testid="cal-others" className="flex flex-col gap-6">
            {byKind(others).map((g) => (
              <section key={g.kind} data-testid={`cal-kind-${g.kind}`}>
                <SectionTitle label={HEADINGS[g.kind] ?? kindLabel(g.kind)} count={g.entries.length} />
                <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                  {g.entries.map((e) => (
                    <LineRow key={e.key} line={e.line} showJob={showJob} selected={e.line.id === openId} onOpen={onOpenLine} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
        <LookAhead week={week} entries={lookahead} showJob={showJob} selectedId={openId} onOpen={onOpenLine} />
      </div>
    </section>
  );
}
