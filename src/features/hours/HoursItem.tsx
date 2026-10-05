// The Hours tool's right column (full screen on the phone): the contract hours form, one day (its report and the hours
// on it, set in one tap), or a week's or month's days (each opens that day).
import { useNavigate } from '@tanstack/react-router';
import { ChevronRight, FileText } from 'lucide-react';
import { useMyHours } from '../../data/hours.queries';
import { formatDay } from '../../lib/dates';
import { addDays, hoursText, monthLabel, sumHours } from '../../lib/timesheet';
import { Icon } from '../../ui/Icon';
import { Button } from '../../ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { BudgetForm } from './BudgetForm';
import { HoursPrompt } from './HoursPrompt';
import { CONTRACT_ITEM, periodDays, reportName } from './model';
import { useHoursNav } from './useHoursNav';

interface DayProps {
  projectId: string;
  reportId: string;
}

function Day({ projectId, reportId }: DayProps) {
  const navigate = useNavigate();
  const days = useMyHours(projectId);
  if (days.isPending) return <LoadingState label="Loading the day" />;
  if (days.isError) return <ErrorState error={days.error} onRetry={() => void days.refetch()} />;
  const day = days.data.find((d) => d.id === reportId);
  if (!day) return <EmptyState icon={TOOL_META.hours.icon} title="Not one of your submitted reports." />;
  return (
    <div className="flex flex-col gap-5 p-4" data-testid="hours-day">
      <header>
        <h2 className="text-base font-semibold text-ink">{formatDay(day.report_date, 'EEEE, MMM d, yyyy')}</h2>
        <p className="text-sm text-ink-2">{reportName(day)}</p>
      </header>
      <HoursPrompt key={day.id} projectId={projectId} reportId={day.id} version={day.version} hours={day.hours} />
      <div>
        <Button
          icon={FileText}
          onClick={() => {
            void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'dailies', itemId: day.id } });
          }}
        >
          Open report
        </Button>
      </div>
    </div>
  );
}

interface PeriodProps {
  projectId: string;
  itemId: string;
}

/** A week's or a month's days, newest first, each opening that day. */
function Period({ projectId, itemId }: PeriodProps) {
  const days = useMyHours(projectId);
  const nav = useHoursNav(projectId);
  if (days.isPending) return <LoadingState label="Loading the days" />;
  if (days.isError) return <ErrorState error={days.error} onRetry={() => void days.refetch()} />;
  const period = periodDays(itemId, days.data);
  if (period === null || period.days.length === 0) return <EmptyState icon={TOOL_META.hours.icon} title="No submitted reports then." />;
  const title =
    period.kind === 'week'
      ? `${formatDay(period.key, 'MMM d')} – ${formatDay(addDays(period.key, 6), 'MMM d, yyyy')}`
      : monthLabel(period.key);
  return (
    <div className="flex flex-col gap-3 py-4" data-testid="hours-period">
      <header className="px-4">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="text-sm text-ink-2">{hoursText(sumHours(period.days))} h</p>
      </header>
      <ul className="divide-y divide-line border-y border-line">
        {period.days.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              data-testid="hours-period-day"
              className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-page/60"
              onClick={() => {
                nav.open(d.id);
              }}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium text-ink">{formatDay(d.report_date, 'EEE, MMM d')}</span>
                <span className="break-words text-xs text-ink-2">{reportName(d)}</span>
              </span>
              <span className="shrink-0 text-[15px] font-medium tabular-nums text-ink">{d.hours === null ? '—' : hoursText(d.hours)}</span>
              <Icon icon={ChevronRight} size={16} className="shrink-0 text-ink-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface HoursItemProps {
  projectId: string;
  itemId: string;
}

export function HoursItem({ projectId, itemId }: HoursItemProps) {
  const nav = useHoursNav(projectId);
  if (itemId === CONTRACT_ITEM) return <BudgetForm projectId={projectId} onSaved={nav.close} />;
  if (periodDays(itemId, []) !== null) return <Period projectId={projectId} itemId={itemId} />;
  return <Day projectId={projectId} reportId={itemId} />;
}
