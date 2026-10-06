// One activity (beside the list; the phone's full screen; the calendar's look-ahead and milestone lines open it): the
// whole name, its dates on the job's clock, what is done, where and who, and which update it comes from.
import type { ReactNode } from 'react';
import { Flag } from 'lucide-react';
import { useScheduleActivity, useScheduleVersions } from '../../data/schedule.queries';
import type { Activity } from '../../data/schedule.types';
import { formatDay } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { ErrorState, LoadingState } from '../../ui/States';
import { VersionChip } from './UpdatesView';
import { versionName } from './model';

interface ActivityPaneProps {
  projectId: string;
  activityId: string;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] font-bold uppercase tracking-[0.04em] text-ink">{label}</dt>
      <dd className="break-words text-[15px] text-ink">{children}</dd>
    </div>
  );
}

function day(d: string | null): string {
  return d === null ? 'None' : formatDay(d, 'EEE, MMM d, yyyy');
}

function done(a: Activity): string | null {
  if (a.actual_finish !== null) return `Finished ${formatDay(a.actual_finish, 'MMM d')}`;
  if (a.actual_start !== null) return `Started ${formatDay(a.actual_start, 'MMM d')}${a.percent !== null && a.percent > 0 ? ` · ${String(Math.round(a.percent))}%` : ''}`;
  return null;
}

export function ActivityPane({ projectId, activityId }: ActivityPaneProps) {
  const activity = useScheduleActivity(projectId, activityId);
  const versions = useScheduleVersions(projectId);
  const failed = activity.isError ? activity : versions.isError ? versions : null;
  if (failed) return <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;
  if (!activity.data || !versions.data) return <LoadingState label="Loading the activity" />;
  const a = activity.data;
  const v = versions.data.find((x) => x.id === a.version_id);
  const progress = done(a);
  return (
    <div className="flex flex-col gap-5 px-5 py-4" data-testid="schedule-activity">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-3">{a.activity_code ?? 'Activity'}</span>
          {v ? <VersionChip status={v.status} /> : null}
        </div>
        <h1 className="flex items-start gap-2 break-words text-[19px] font-semibold leading-7 tracking-[-0.01em] text-ink" data-testid="schedule-activity-name">
          {a.is_milestone ? <Icon icon={Flag} size={18} label="Milestone" className="mt-1 shrink-0 text-accent" /> : null}
          <span className="min-w-0">{a.name}</span>
        </h1>
        {progress ? <p className="text-[13px] text-ink-2">{progress}</p> : null}
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {a.is_milestone ? <Fact label="Date">{day(a.start_date)}</Fact> : <Fact label="Start">{day(a.start_date)}</Fact>}
        {a.is_milestone ? null : <Fact label="Finish">{day(a.finish_date)}</Fact>}
        {a.area ? <Fact label="Area">{a.area}</Fact> : null}
        {a.trade ? <Fact label="Trade">{a.trade}</Fact> : null}
        {a.wbs ? <Fact label="WBS">{a.wbs}</Fact> : null}
        {a.csi_division ? <Fact label="CSI">{a.csi_division}</Fact> : null}
        {v ? (
          <Fact label="From">
            {versionName(v)}
            {v.data_date ? ` · Data date ${formatDay(v.data_date, 'MMM d')}` : ''}
          </Fact>
        ) : null}
      </dl>
    </div>
  );
}
