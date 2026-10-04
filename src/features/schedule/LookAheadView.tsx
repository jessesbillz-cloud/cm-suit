// The look-ahead (MDR's weekly shape): 3 weeks or 2 months from this week's Monday. What is underway first, then each
// week's new starts, whole names, dates on the job's clock, and a Today line in this week. A tap opens the activity.
import { ChartGantt } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Activity } from '../../data/schedule.types';
import { formatDay } from '../../lib/dates';
import { ChipPick } from '../../ui/ChipPick';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/States';
import { ActivityRow } from './ActivityRow';
import { lookAhead, RANGES, weekLabel, weekSpan, type Range } from './model';

interface LookAheadViewProps {
  activities: readonly Activity[];
  today: string;
  range: Range;
  onRange: (r: Range) => void;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

function Group({ title, sub, count, testId, children }: { title: string; sub: string | null; count: number; testId: string; children: ReactNode }) {
  return (
    <section data-testid={testId} className="border-b border-line last:border-b-0">
      <header className="flex items-baseline gap-2 bg-card-head px-4 py-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-2">{title}</h2>
        {sub ? <span className="text-[13px] text-ink-3">{sub}</span> : null}
        <span className="ml-auto text-[13px] tabular-nums text-ink-3">{count}</span>
      </header>
      <ul className="divide-y divide-line">{children}</ul>
    </section>
  );
}

function TodayLine({ today }: { today: string }) {
  return (
    <li className="flex items-center gap-2 px-4 py-1" data-testid="schedule-today">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-accent">Today {formatDay(today, 'EEE MMM d')}</span>
      <span className="h-px flex-1 bg-accent/60" />
    </li>
  );
}

function rows(items: readonly Activity[], selectedId: string | null, onOpen: (id: string) => void): ReactNode[] {
  return items.map((a) => <ActivityRow key={a.id} activity={a} selected={a.id === selectedId} onOpen={onOpen} />);
}

export function LookAheadView({ activities, today, range, onRange, selectedId, onOpen }: LookAheadViewProps) {
  const la = lookAhead(activities, today, range);
  const [thisWeek, ...later] = la.weeks;
  const picker = (
    <ChipPick
      label="Look-ahead"
      chips={RANGES.map((r) => ({ value: r.value, label: r.label }))}
      picked={[range]}
      onChange={(p) => {
        const next = p[0];
        if (next) onRange(next);
      }}
      testId="schedule-range"
    />
  );
  const empty = la.underway.length === 0 && la.weeks.every((w) => w.items.length === 0);
  const before = thisWeek ? thisWeek.items.filter((a) => (a.start_date ?? '') < today) : [];
  const after = thisWeek ? thisWeek.items.filter((a) => (a.start_date ?? '') >= today) : [];
  return (
    <div className="flex flex-col gap-3" data-testid="schedule-lookahead">
      {picker}
      <Card padded={false} className="overflow-hidden">
        {empty ? (
          <EmptyState icon={ChartGantt} title={`Nothing in the next ${range === '3w' ? '3 weeks' : '2 months'}.`} />
        ) : (
          <>
            {la.underway.length > 0 ? (
              <Group title="Underway" sub={null} count={la.underway.length} testId="schedule-underway">
                {rows(la.underway, selectedId, onOpen)}
              </Group>
            ) : null}
            {thisWeek ? (
              <Group title="This week" sub={weekSpan(thisWeek.start)} count={thisWeek.items.length} testId="schedule-week-0">
                {rows(before, selectedId, onOpen)}
                <TodayLine today={today} />
                {rows(after, selectedId, onOpen)}
              </Group>
            ) : null}
            {later
              .filter((w) => w.items.length > 0)
              .map((w) => (
                <Group
                  key={w.start}
                  title={weekLabel(w.start, today) ?? weekSpan(w.start)}
                  sub={weekLabel(w.start, today) === null ? null : weekSpan(w.start)}
                  count={w.items.length}
                  testId={`schedule-week-${w.start}`}
                >
                  {rows(w.items, selectedId, onOpen)}
                </Group>
              ))}
          </>
        )}
      </Card>
    </div>
  );
}
