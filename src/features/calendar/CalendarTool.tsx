// Calendar (SPEC §7.6, §12.3). Week (default), Day and Month; "All my jobs" when projectId is null, each line with
// its job. Days and times are each job's own (projects.timezone). The phone gets the week as one list.
import { useMemo } from 'react';
import { useCalendarLines } from '../../data/calendar.queries';
import { useCapability, useMyProjects, useUserLayout } from '../../data/queries';
import { detectZone, todayInZone } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { ErrorState, LoadingState } from '../../ui/States';
import { CalendarBar } from './CalendarBar';
import { DayView, WeekView, type DaysProps } from './DayViews';
import { bucketByDay, rangeFor, rangeLabel, step, visibleDays, visibleLines, type CalView } from './model';
import { MonthView } from './MonthView';
import { PhoneAgenda } from './PhoneAgenda';
import { TypeFilter } from './TypeFilter';
import { useCalendarNav, type CalendarNav } from './useCalendarNav';

interface CalendarToolProps {
  projectId: string | null;
  itemId: string | null;
  isPhone: boolean;
}

const EMPTY_WORDS: Record<CalView, string> = { week: 'Nothing this week.', day: 'Nothing this day.', month: 'Nothing this month.' };

interface BodyProps {
  view: CalView;
  isPhone: boolean;
  anchor: string;
  nav: CalendarNav;
  days: DaysProps;
}

function CalendarBody({ view, isPhone, anchor, nav, days }: BodyProps) {
  if (isPhone) return <PhoneAgenda {...days} />;
  if (view === 'day') return <DayView {...days} />;
  if (view === 'month') return <MonthView {...days} month={anchor.slice(0, 7)} onShowDay={nav.showDay} />;
  return <WeekView {...days} />;
}

export function CalendarTool({ projectId, itemId, isPhone }: CalendarToolProps) {
  const nav = useCalendarNav(projectId);
  const projects = useMyProjects();
  const layout = useUserLayout();
  const manage = useCapability(projectId, 'calendar.manage');

  const job = projects.data?.find((p) => p.project_id === projectId);
  // "Today" is the job's today; on "All my jobs", this device's.
  const today = todayInZone(job?.timezone ?? detectZone());
  const anchor = nav.day ?? today;
  const view: CalView = isPhone ? 'week' : nav.view;
  const days = useMemo(() => visibleDays(view, anchor), [view, anchor]);
  const lines = useCalendarLines(projectId, rangeFor(days));

  const types = layout.data?.choices.calendar_types;
  const shown = useMemo(
    () => visibleLines(lines.data ?? [], types ?? [], projects.data ?? [], projectId),
    [lines.data, types, projects.data, projectId],
  );
  const buckets = useMemo(() => bucketByDay(shown, days), [shown, days]);

  if (layout.isPending || projects.isPending) return <LoadingState label="Loading calendar" />;
  if (layout.isError) return <ErrorState error={layout.error} onRetry={() => void layout.refetch()} />;
  if (projects.isError) return <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />;

  // All my jobs: the add form picks the job (and checks it); one job: only with calendar.manage.
  const canAdd = projectId === null || manage.data === true;
  // While the next range loads, the previous one's lines stay (keepPreviousData): no "nothing" until it's real.
  const empty = lines.isSuccess && !lines.isPlaceholderData && [...buckets.values()].every((l) => l.length === 0);
  const daysProps: DaysProps = {
    days,
    buckets,
    today,
    showJob: projectId === null,
    selectedId: itemId,
    canAdd,
    onOpen: nav.openLine,
    onAdd: nav.add,
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3">
      <CalendarBar
        view={view}
        label={rangeLabel(view, days, anchor)}
        showViews={!isPhone}
        onView={nav.setView}
        onStep={(dir) => {
          nav.setDay(step(view, anchor, dir));
        }}
        onToday={() => {
          nav.setDay(null);
        }}
      />
      <TypeFilter selected={types ?? []} />
      <Card padded={false}>
        {lines.isPending ? <LoadingState label="Loading calendar" /> : null}
        {lines.isError ? <ErrorState error={lines.error} onRetry={() => void lines.refetch()} /> : null}
        {empty ? (
          <p data-testid="cal-empty" className="border-b border-line px-4 py-2 text-sm text-ink-2">
            {(types ?? []).length === 0 ? 'No types picked.' : EMPTY_WORDS[view]}
          </p>
        ) : null}
        {lines.isSuccess ? <CalendarBody view={view} isPhone={isPhone} anchor={anchor} nav={nav} days={daysProps} /> : null}
      </Card>
    </div>
  );
}
