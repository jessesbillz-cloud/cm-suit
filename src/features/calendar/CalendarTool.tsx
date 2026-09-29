// Calendar (SPEC §7.6, §12.3). Week (default), Day and Month; "All my jobs" when projectId is null, each line with
// its job. Days and times are each job's own (projects.timezone). The phone gets the week as one list.
import { useMemo } from 'react';
import { useCalendarLines } from '../../data/calendar.queries';
import { useCapability, useMyProjects, useUserLayout } from '../../data/queries';
import { detectZone, todayInZone } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { DayStepper, ViewSwitch } from './CalendarBar';
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

  const header = (
    <PageHeader
      title={TOOL_META.calendar.label}
      icon={TOOL_META.calendar.icon}
      meta={<span data-testid="cal-range">{rangeLabel(view, days, anchor)}</span>}
      actions={
        <>
          {isPhone ? null : <ViewSwitch current={view} onPick={nav.setView} />}
          <DayStepper
            onStep={(dir) => {
              nav.setDay(step(view, anchor, dir));
            }}
            onToday={() => {
              nav.setDay(null);
            }}
          />
        </>
      }
      below={types ? <TypeFilter selected={types} /> : null}
    />
  );

  const failed = layout.isError ? layout : projects.isError ? projects : null;
  if (layout.isPending || projects.isPending || failed) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col">
        {header}
        <Card padded={false}>
          {failed ? <ErrorState error={failed.error} onRetry={() => void failed.refetch()} /> : <LoadingState label="Loading calendar" />}
        </Card>
      </div>
    );
  }

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
    <div className="mx-auto flex max-w-6xl flex-col">
      {header}
      <Card padded={false} className="overflow-hidden">
        {lines.isPending ? <LoadingState label="Loading calendar" /> : null}
        {lines.isError ? <ErrorState error={lines.error} onRetry={() => void lines.refetch()} /> : null}
        {empty ? (
          <p data-testid="cal-empty" className="border-b border-line bg-card-head px-4 py-2.5 text-sm text-ink-2">
            {(types ?? []).length === 0 ? 'No types picked.' : EMPTY_WORDS[view]}
          </p>
        ) : null}
        {lines.isSuccess ? <CalendarBody view={view} isPhone={isPhone} anchor={anchor} nav={nav} days={daysProps} /> : null}
      </Card>
    </div>
  );
}
