// The job's inspection calendar for a month (SPEC §13.2; Jesse Oct 10, ui/MonthCalendar): live (refetches every 30 s),
// the whole month on one screen, each day its date and a dot per booking in its status color (lib/status). A tap on a
// day opens its bookings right under its week: time, type, IR number and company (my own requests, or all of them for
// the GC team and inspectors) and the state; a request opens in the right column. Blocked time is a red dot and a line.
import { useMemo } from 'react';
import { useIrCalendar } from '../../data/inspections.queries';
import type { CalendarRow } from '../../data/inspections.types';
import { formatDay } from '../../lib/dates';
import { monthDays, pickDay, placeFrom, placeSearch, stepMonth, type CalendarPlace } from '../../lib/monthGrid';
import { CalendarBar } from '../../ui/CalendarBar';
import { Card } from '../../ui/Card';
import { MonthCalendar, type DayMark } from '../../ui/MonthCalendar';
import { ErrorState, LoadingState } from '../../ui/States';
import { EntryLine } from './EntryLine';
import { rowChip } from './model';

interface MonthViewProps {
  projectId: string;
  /** The URL's month anchor and open day (lib/monthGrid). */
  at: string | null;
  openDay: string | null;
  today: string;
  selectedId: string | null;
  /** I decide OFS requests (the deputy): the lines' words follow. */
  ofsDecide: boolean;
  onMove: (place: { at?: string; day?: string }) => void;
  onOpen: (id: string) => void;
}

function marksOf(rows: readonly CalendarRow[], ofsDecide: boolean): Map<string, DayMark[]> {
  const out = new Map<string, DayMark[]>();
  rows.forEach((r, i) => {
    const list = out.get(r.request_date) ?? [];
    list.push({ key: `${r.id ?? 'row'}-${String(i)}`, tone: rowChip(r, ofsDecide).status });
    out.set(r.request_date, list);
  });
  return out;
}

function countLabel(n: number): string {
  return n === 0 ? 'Nothing booked' : n === 1 ? '1 request' : `${String(n)} requests`;
}

export function MonthView({ projectId, at, openDay, today, selectedId, ofsDecide, onMove, onOpen }: MonthViewProps) {
  const place = placeFrom({ at, day: openDay }, today);
  const { anchor, open } = place;
  const days = monthDays(anchor);
  const cal = useIrCalendar(projectId, days[0] ?? anchor, days[days.length - 1] ?? anchor);
  const marks = useMemo(() => marksOf(cal.data ?? [], ofsDecide), [cal.data, ofsDecide]);
  const month = anchor.slice(0, 7);
  const requests = cal.data?.filter((r) => !r.is_block && r.request_date.startsWith(month)).length ?? 0;
  const dayRows = open === null ? [] : (cal.data ?? []).filter((r) => r.request_date === open);

  function move(p: CalendarPlace) {
    onMove(placeSearch(p, today));
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <CalendarBar
        title={formatDay(anchor, 'MMMM yyyy')}
        testIdPrefix="ir"
        meta={cal.data ? countLabel(requests) : null}
        onStep={(dir) => {
          move({ anchor: stepMonth(anchor, dir), open: null });
        }}
        onToday={() => {
          move({ anchor: today, open: today });
        }}
      />
      {cal.isPending ? <LoadingState label="Loading the month" /> : null}
      {cal.isError ? <ErrorState error={cal.error} onRetry={() => void cal.refetch()} /> : null}
      {cal.data ? (
        <MonthCalendar
          anchor={anchor}
          today={today}
          open={open}
          marks={marks}
          testIdPrefix="ir"
          onPick={(d) => {
            move(pickDay(place, d));
          }}
        >
          {dayRows.length > 0 ? (
            <section className="flex flex-col gap-1.5 p-2 sm:p-3" aria-label={formatDay(open ?? anchor, 'EEEE, MMMM d')}>
              {dayRows.map((r, i) => (
                <EntryLine
                  key={r.id ?? `${r.request_date}-${String(i)}`}
                  row={r}
                  selected={r.id !== null && r.id === selectedId}
                  ofsDecide={ofsDecide}
                  onOpen={onOpen}
                />
              ))}
            </section>
          ) : null}
        </MonthCalendar>
      ) : null}
    </Card>
  );
}
