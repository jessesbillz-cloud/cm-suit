// The selected day under the calendar (MDR's day panel): the weekday over the big date and the day's count, Add and
// Block time, the day's requests by state (each a card that opens in the right column with the inspector's steps),
// blocked time, the day's other lines (deliveries, meetings, milestones, due items), then the week's look-ahead.
import { CalendarOff, Plus } from 'lucide-react';
import type { CalendarLine } from '../../data/calendar.types';
import { formatDay } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
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
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-line px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          {formatDay(day, 'EEEE')}
          {day === today ? <span className="text-accent"> · Today</span> : null}
        </p>
        <h2 data-testid="cal-day-title" className="text-[26px] font-semibold leading-8 tracking-[-0.015em] text-ink">
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

export function DayDetail(props: DayDetailProps) {
  const { day, entries, week, lookahead, showJob, openId, onOpenRequest, onOpenLine } = props;
  const requests = entries.filter((e): e is IrEntry => e.type === 'ir');
  const others = entries.filter((e): e is LineEntry => e.type === 'line' && !isLookahead(e));
  const groups = groupRequests(requests);
  return (
    <Card padded={false} className="mt-4">
      <section data-testid="cal-day-detail" aria-label={formatDay(day, 'EEEE, MMMM d')}>
        <Header {...props} />
        <div className="flex flex-col gap-6 p-4 sm:p-5">
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
            <section data-testid="cal-others">
              <SectionTitle label="Other" count={others.length} />
              <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {others.map((e) => (
                  <LineRow key={e.key} line={e.line} showJob={showJob} selected={e.line.id === openId} onOpen={onOpenLine} />
                ))}
              </div>
            </section>
          ) : null}
          {groups.length === 0 && others.length === 0 ? (
            <p data-testid="cal-day-empty" className="py-4 text-center text-sm text-ink-2">
              Nothing on this day.
            </p>
          ) : null}
          <LookAhead week={week} entries={lookahead} showJob={showJob} selectedId={openId} onOpen={onOpenLine} />
        </div>
      </section>
    </Card>
  );
}
