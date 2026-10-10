// Calendar (SPEC §7.6, §12.3; MDR's schedule calendar, Jesse Sep 28 and Oct 10). The month (default) fits on one screen
// (ui/MonthCalendar): each day its date and dots in its items' status colors; a tap opens the day right under its
// week with its requests, other lines and the week's look-ahead (DayDetail). The week (desktop) shows each day in full
// and the open day under it. "All my jobs" (projectId null) merges every job, which is how double-booking shows. Days
// and times are each job's own (projects.timezone). The phone gets the same month, one column under it.
import { useMemo } from 'react';
import { useCalendarKinds } from '../../data/calendar.queries';
import type { CalendarLine } from '../../data/calendar.types';
import { useCapability, useJobsWithCapability, useMyProjects } from '../../data/queries';
import { detectZone, todayInZone } from '../../lib/dates';
import { toolIsOn } from '../../lib/jobs';
import { pickDay, placeFrom, placeSearch, type CalendarPlace } from '../../lib/monthGrid';
import { CalendarBar } from '../../ui/CalendarBar';
import { Card } from '../../ui/Card';
import { MonthCalendar } from '../../ui/MonthCalendar';
import { PageHeader } from '../../ui/PageHeader';
import { Segments } from '../../ui/Segments';
import { ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { CalendarFooter } from './CalendarFooter';
import { DayDetail, dayHasPanel } from './DayDetail';
import { dayMarks, isLookahead, type Entry, type LineEntry } from './entries';
import { CAL_VIEWS, offeredKinds, rangeLabel, step, VIEW_LABELS, visibleDays, type CalView } from './model';
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
  const place = placeFrom({ at: nav.at, day: nav.day }, today);
  const { anchor, open } = place;
  const view: CalView = isPhone ? 'month' : nav.view;
  const days = useMemo(() => visibleDays(view, anchor), [view, anchor]);
  // The open day's week (its look-ahead).
  const week = useMemo(() => visibleDays('week', open ?? anchor), [open, anchor]);
  const data = useCalendarData(projectId, days);
  const manage = useCapability(projectId, 'calendar.manage');
  const kinds = useCalendarKinds();
  const offered = useMemo(() => offeredKinds(kinds.data, projects.data ?? [], projectId), [kinds.data, projects.data, projectId]);
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
      actions={isPhone ? null : <Segments options={VIEW_OPTIONS} value={view} onPick={nav.setView} label="Calendar view" testId="cal-view" />}
      below={data.types ? <TypeFilter selected={data.types} offered={offered} /> : null}
    />
  );
  function move(p: CalendarPlace) {
    nav.moveTo(placeSearch(p, today));
  }
  const bar = (
    <CalendarBar
      title={rangeLabel(view, days, anchor)}
      testIdPrefix="cal"
      onStep={(dir) => {
        move({ anchor: step(view, anchor, dir), open: null });
      }}
      onToday={() => {
        move({ anchor: today, open: today });
      }}
    />
  );

  const failed = data.layout.isError ? data.layout : data.projects.isError ? data.projects : null;
  if (data.layout.isPending || data.projects.isPending || failed) {
    return (
      <div className="flex flex-col">
        {header}
        <Card padded={false}>
          {bar}
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
  const onPick = (d: string) => {
    move(pickDay(place, d));
  };

  function openEntry(e: Entry) {
    if (e.type === 'line') nav.openLine(e.line);
    else if (e.row.full_detail && !e.row.is_block && e.row.id !== null) nav.openRequest(e.projectId, e.row.id);
    else move({ anchor: e.day, open: e.day });
  }

  const panel = {
    entries: open === null ? [] : (byDay.get(open) ?? []),
    lookahead: open === null ? [] : lookahead,
    onAdd: canAdd
      ? () => {
          nav.add(open ?? today);
        }
      : null,
    onBlock: canBlock ? nav.block : null,
  };
  const detail =
    open !== null && dayHasPanel(panel) ? (
      <DayDetail
        {...panel}
        day={open}
        today={today}
        week={week}
        showJob={showJob}
        openId={itemId}
        isPhone={isPhone}
        onOpenRequest={(e) => {
          if (e.row.id !== null) nav.openRequest(e.projectId, e.row.id);
        }}
        onOpenLine={(line: CalendarLine) => {
          nav.openLine(line);
        }}
      />
    ) : null;

  return (
    <div className="flex flex-col" data-testid="calendar">
      {header}
      <Card padded={false} className="overflow-hidden">
        {bar}
        {lines.isError ? <ErrorState error={lines.error} onRetry={() => void lines.refetch()} /> : null}
        {inspections.error ? <ErrorState error={inspections.error} onRetry={inspections.refetch} /> : null}
        {empty ? (
          <p data-testid="cal-empty" className="border-b border-line bg-card-head px-4 py-2 text-sm text-ink-2">
            {(types ?? []).length === 0 ? 'No types picked.' : EMPTY_WORDS[view]}
          </p>
        ) : null}
        {loading ? <LoadingState label="Loading calendar" /> : null}
        {!loading && view === 'month' ? (
          <MonthCalendar anchor={anchor} today={today} open={open} marks={dayMarks(byDay)} testIdPrefix="cal" onPick={onPick}>
            {detail}
          </MonthCalendar>
        ) : null}
        {!loading && view === 'week' ? (
          <>
            <WeekGrid days={days} byDay={byDay} today={today} selected={open} showJob={showJob} onSelect={onPick} onOpen={openEntry} />
            {detail ? <div className="border-t border-line bg-page/40">{detail}</div> : null}
          </>
        ) : null}
        <CalendarFooter jobs={shareJobs} onSubscribe={nav.subscribe} />
      </Card>
    </div>
  );
}
