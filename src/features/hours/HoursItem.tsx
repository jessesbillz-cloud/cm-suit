// The Hours tool's right column (full screen on the phone): the contract hours form, or one day: its report and the
// hours on it, set in one tap.
import { useNavigate } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import { useMyHours } from '../../data/hours.queries';
import { formatDay } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { BudgetForm } from './BudgetForm';
import { HoursPrompt } from './HoursPrompt';
import { CONTRACT_ITEM, reportName } from './model';
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

interface HoursItemProps {
  projectId: string;
  itemId: string;
}

export function HoursItem({ projectId, itemId }: HoursItemProps) {
  const nav = useHoursNav(projectId);
  if (itemId === CONTRACT_ITEM) return <BudgetForm projectId={projectId} onSaved={nav.close} />;
  return <Day projectId={projectId} reportId={itemId} />;
}
