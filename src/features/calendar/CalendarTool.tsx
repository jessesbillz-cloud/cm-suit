// Calendar (SPEC §7.6, §12.3; MDR's schedule calendar, Jesse Sep 28). The month (default) or the week: each day shows
// its inspections as banners in their status colors, and the selected day opens underneath with its requests, other
// lines and the week's look-ahead. "All my jobs" (projectId null) merges every job, which is how double-booking shows.
// Days and times are each job's own (projects.timezone). The phone gets the same month and day, one column.
import { useMemo } from 'react';
import type { CalendarLine } from '../../data/calendar.types';
import { useCapability, useJobsWithCapability, useMyProjects } from '../../data/queries';
import { detectZone, todayInZone } from '../../lib/dates';
import { toolIsOn } from '../../lib/jobs';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { Segments } from '../../ui/Segments';
import { ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { CalendarFooter } from './CalendarFooter';
import { DayStepper } from './CalendarBar';
import { DayDetail } from './DayDetail';
import { isLookahead, type Entry, type LineEntry } from './entries';
import { CAL_VIEWS, rangeLabel, step, VIEW_LABELS, visibleDays, type CalView } from './model';
import { MonthGrid } from './MonthGrid';
import { TypeFilter } from './TypeFilter';
import { useCalendarData } from './useCalendarData';
import { useCalendarNav } from './useCalendarNav';
import { WeekGrid } from './WeekGrid';

interface CalendarToolProps {
  projectId: string | null;
  itemId: string | null;
  isPhone: boolean;
}

const VIEW_OPTIONS = CAL_VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] }));
const EMPTY_WORDS: Record<CalView, string> = { week: 'Nothing this week.', month: 'Nothing this month.' };

export function CalendarTool({ projectId, itemId, isPhone }: CalendarToolProps) {
  const nav = useCalendarNav(projectId);
  const projects = useMyProjects();
  const job = projects.data?.find((p) => p.project_id === projectId);
  // "Today" is the job's today; on "All my jobs", this device's.
  const today = todayInZone(job?.timezone ?? detectZone());
  const selected = nav.day ?? today;
  const view: CalView = isPhone ? 'month' : nav.view;
  const days = useMemo(() => visibleDays(view, selected), [view, selected]);
  const week = useMemo(() => visibleDays('week', selected), [selected]);
  const data = useCalendarData(projectId, days);
  const manage = useCapability(projectId, 'calendar.manage');
  // All my jobs: Add shows only when some job with the calendar on lets me add lines (as Block time does).
  const calendarJobs = useMemo(
    () => (projectId === null ? (projects.data ?? []).filter((p) => toolIsOn('calendar', p.modules)).map((p) => p.project_id) : []),
    [projects.data, projectId],
  );
  const managers = useJobsWithCapability(calendarJobs, 'calendar.manage');
  const deciders = useJobsWithCapability(data.irJobs, 'ir.decide');
  // Share is the job team's (the GC team and inspectors: ir.view_all), not every requester's.
  const team = useJobsWithCapability(data.irJobs, 'ir.view_all');

  const header = (
    <PageHeader
      title={TOOL_META.calendar.label}
      icon={TOOL_META.calendar.icon}
      meta={<span data-testid="cal-range">{rangeLabel(view, days, selected)}</span>}
      actions={
        <>
          {isPhone ? null : <Segments options={VIEW_OPTIONS} value={view} onPick={nav.setView} label="Calendar view" testId="cal-view" />}
          <DayStepper
            onStep={(dir) => {
              nav.setDay(step(view, selected, dir));
            }}
            onToday={() => {
              nav.setDay(null);
            }}
          />
        </>
      }
      below={data.types ? <TypeFilter selected={data.types} /> : null}
    />
  );

  const failed = data.layout.isError ? data.layout : data.projects.isError ? data.projects : null;
  if (data.layout.isPending || data.projects.isPending || failed) {
    return (
      <div className="flex flex-col">
        {header}
        <Card padded={false}>
          {failed ? <ErrorState error={failed.error} onRetry={() => void failed.refetch()} /> : <LoadingState label="Loading calendar" />}
        </Card>
      </div>
    );
  }

  const { lines, inspections, byDay, types } = data;
  const showJob = projectId === null;
  const loading = lines.isPending || inspections.isPending;
  // While the next range loads, the previous one's stays (keepPreviousData): no "nothing" until it's real.
  const settled = lines.isSuccess && !lines.isPlaceholderData && !inspections.isPending;
  const empty = settled && [...byDay.values()].every((l) => l.length === 0);
  const shareJobs = (data.projects.data ?? [])
    .filter((p) => (team.ids ?? []).includes(p.project_id))
    .map((p) => ({ project_id: p.project_id, name: p.name }));
  // All my jobs: the add form picks the job; one job: only with calendar.manage.
  const canAdd = projectId === null ? (managers.ids ?? []).length > 0 : manage.data === true;
  const canBlock = (deciders.ids ?? []).length > 0;
  const lookahead = week.flatMap((d) => byDay.get(d) ?? []).filter((e): e is LineEntry => isLookahead(e));

  function openEntry(e: Entry) {
    if (e.type === 'line') nav.openLine(e.line);
    else if (e.row.full_detail && !e.row.is_block && e.row.id !== null) nav.openRequest(e.projectId, e.row.id);
    else nav.selectDay(e.day);
  }

  return (
    <div className="flex flex-col" data-testid="calendar">
      {header}
      <Card padded={false} className="overflow-hidden">
        {lines.isError ? <ErrorState error={lines.error} onRetry={() => void lines.refetch()} /> : null}
        {inspections.error ? <ErrorState error={inspections.error} onRetry={inspections.refetch} /> : null}
        {empty ? (
          <p data-testid="cal-empty" className="border-b border-line bg-card-head px-4 py-2.5 text-sm text-ink-2">
            {(types ?? []).length === 0 ? 'No types picked.' : EMPTY_WORDS[view]}
          </p>
        ) : null}
        {loading ? <LoadingState label="Loading calendar" /> : null}
        {!loading && view === 'month' ? (
          <MonthGrid days={days} month={selected.slice(0, 7)} byDay={byDay} today={today} selected={selected} isPhone={isPhone} onSelect={nav.selectDay} />
        ) : null}
        {!loading && view === 'week' ? (
          <WeekGrid days={days} byDay={byDay} today={today} selected={selected} showJob={showJob} onSelect={nav.selectDay} onOpen={openEntry} />
        ) : null}
        <CalendarFooter jobs={shareJobs} onSubscribe={nav.subscribe} />
      </Card>
      {!loading ? (
        <DayDetail
          day={selected}
          today={today}
          entries={byDay.get(selected) ?? []}
          week={week}
          lookahead={lookahead}
          showJob={showJob}
          openId={itemId}
          isPhone={isPhone}
          onAdd={
            canAdd
              ? () => {
                  nav.add(selected);
                }
              : null
          }
          onBlock={canBlock ? nav.block : null}
          onOpenRequest={(e) => {
            if (e.row.id !== null) nav.openRequest(e.projectId, e.row.id);
          }}
          onOpenLine={(line: CalendarLine) => {
            nav.openLine(line);
          }}
        />
      ) : null}
    </div>
  );
}
