// The home's first card for whoever inspects or requests inspections: today's requests on those jobs (live, the
// calendar's own answer), each with its time, number, type, job and state. A tap opens the request in Inspections.
// A requester sees their own; an inspector every request they read in full. Blocked time is not a request.
import { useMemo } from 'react';
import { useOpenTarget } from '../../../app/frame/useOpenTarget';
import { useCalendarInspections } from '../../../data/calendar.queries';
import type { CalendarInspection } from '../../../data/calendar.types';
import { useMyProjects } from '../../../data/queries';
import { detectZone, todayInZone } from '../../../lib/dates';
import { entityTarget } from '../../../lib/entityTarget';
import { Card } from '../../../ui/Card';
import { ErrorState, LoadingState } from '../../../ui/States';
import { StatusChip } from '../../../ui/StatusChip';
import { TOOL_META } from '../../../ui/tools';
import { rowChip, typeLabel } from '../../inspections/model';
import { clockLabel } from '../../inspections/time';
import { NeedsRow } from '../NeedsRow';
import { CountTitle } from './CountTitle';

interface InspectionsTodayProps {
  jobs: readonly string[];
  /** Jobs where I decide OFS requests. */
  ofsJobs: readonly string[];
}

/** All day and Flexible first, then by the clock. */
function sortKey(r: CalendarInspection): string {
  return r.duration_kind === 'all_day' || r.start_time === null ? '' : r.start_time;
}

function when(r: CalendarInspection): string {
  return r.duration_kind === 'all_day' ? 'All day' : clockLabel(r.start_time);
}

export function InspectionsToday({ jobs, ofsJobs }: InspectionsTodayProps) {
  // On All my jobs, today is this device's (the calendar's rule).
  const today = todayInZone(detectZone());
  const ir = useCalendarInspections(jobs, today, today);
  const projects = useMyProjects();
  const openTarget = useOpenTarget();
  const rows = useMemo(
    () =>
      ir.rows
        .filter((r) => !r.is_block && r.full_detail && r.id !== null && r.request_date === today)
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || (a.number ?? 0) - (b.number ?? 0)),
    [ir.rows, today],
  );
  const nameOf = (id: string) => projects.data?.find((p) => p.project_id === id)?.name ?? '';
  const loading = ir.isPending && rows.length === 0;

  return (
    <div data-testid="home-inspections">
      <Card title={<CountTitle label="Inspections today" count={loading ? null : rows.length} testId="home-inspections-count" />} padded={false}>
        {loading ? <LoadingState label="Loading today's inspections" /> : null}
        {ir.error ? <ErrorState error={ir.error} title="Today's inspections did not load." onRetry={ir.refetch} /> : null}
        {!loading && !ir.error && rows.length === 0 ? <p className="px-4 py-3 text-sm text-ink-2">None today.</p> : null}
        {rows.length > 0 ? (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const chip = rowChip(r, ofsJobs.includes(r.project_id));
              const target = entityTarget('inspection_request', r.id);
              return (
                <NeedsRow
                  key={`${r.project_id}:${r.id ?? ''}`}
                  testId="home-inspection"
                  icon={TOOL_META.inspections.icon}
                  title={
                    <>
                      <span className="font-medium tabular-nums">{when(r)}</span>
                      {r.number === null ? '' : ` · IR ${String(r.number)}`} · {typeLabel(r.kind, r.special_kind)}
                    </>
                  }
                  meta={[nameOf(r.project_id), r.company ?? ''].filter((s) => s !== '').join(' · ')}
                  end={<StatusChip status={chip.status} label={chip.label} />}
                  onOpen={() => {
                    if (target) openTarget(r.project_id, target);
                  }}
                />
              );
            })}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
