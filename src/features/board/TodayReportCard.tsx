// One job's report today (the top of All my jobs, My Daily Reports' home): its state on a colored left edge and a chip,
// the job, "#233 · Daily M-F", the one button that opens today's report in the job's Dailies (Start makes it first, the
// same Start as Dailies), and the job's calendar.
import { useId } from 'react';
import { useOpenTarget } from '../../app/frame/useOpenTarget';
import { useCreateDailyReport } from '../../data/dailies.mutations';
import type { DailyTodayRow } from '../../data/dailyToday.types';
import { messageOf } from '../../data/errors';
import { DAILY_SETTINGS_DEFAULTS } from '../../lib/dailies';
import { Button } from '../../ui/Button';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { TOOL_META } from '../../ui/tools';
import { TODAY_ACTIONS, TODAY_CHIPS, todayMeta, todayState } from './dailyToday';

interface TodayReportCardProps {
  row: DailyTodayRow;
  /** The job's Calendar is on: show its button. */
  calendar: boolean;
}

export function TodayReportCard({ row, calendar }: TodayReportCardProps) {
  const openTarget = useOpenTarget();
  const create = useCreateDailyReport(row.project_id);
  const toast = useToast();
  const nameId = useId();
  const state = todayState(row);
  const chip = TODAY_CHIPS[state];
  const action = TODAY_ACTIONS[state];
  const main = state === 'due' || state === 'draft';

  const openReport = (reportId: string) => {
    openTarget(row.project_id, { tool: 'dailies', itemId: reportId });
  };

  function open() {
    if (row.report_id !== null) {
      openReport(row.report_id);
      return;
    }
    create.mutate(
      { reportType: row.report_type, reportDate: row.today },
      {
        onSuccess: openReport,
        onError: (e) => {
          toast.show({ tone: 'error', message: messageOf(e) });
        },
      },
    );
  }

  return (
    <article
      aria-labelledby={nameId}
      data-testid="today-report"
      data-project={row.project_id}
      data-state={state}
      className="relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-card bg-card py-3 pl-5 pr-3 shadow-card"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: `var(--status-${chip.status}-dot)` }} />
      <div className="flex items-center justify-between gap-2">
        <span data-testid="today-report-status">
          <StatusChip status={chip.status} label={chip.label} />
        </span>
        {calendar ? (
          <Button
            size="sm"
            variant="quiet"
            icon={TOOL_META.calendar.icon}
            title={TOOL_META.calendar.label}
            aria-label={`${TOOL_META.calendar.label} · ${row.project_name}`}
            // A full-size tap target on a phone that takes no more room than the chip beside it.
            className="-my-1.5 -mr-1 max-sm:-my-[11px] max-sm:h-11 max-sm:w-11"
            data-testid="today-report-calendar"
            onClick={() => {
              openTarget(row.project_id, { tool: 'calendar', itemId: null });
            }}
          />
        ) : null}
      </div>
      <h3 id={nameId} className="break-words pr-1 text-[17px] font-semibold leading-6 tracking-[-0.01em] text-ink">
        {row.project_name}
      </h3>
      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <p className="min-w-0 text-[13px] font-medium tabular-nums text-ink-2" data-testid="today-report-meta">
          {todayMeta(row)}
        </p>
        <Button
          variant={main ? 'primary' : 'secondary'}
          loading={create.isPending}
          aria-label={`${action} ${row.label ?? DAILY_SETTINGS_DEFAULTS.label} · ${row.project_name}`}
          className="min-w-[6.5rem] shrink-0 max-sm:h-11"
          data-testid="today-report-action"
          onClick={open}
        >
          {action}
        </Button>
      </div>
    </article>
  );
}
