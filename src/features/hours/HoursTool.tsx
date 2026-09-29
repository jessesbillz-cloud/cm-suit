// Hours (SPEC §15): my hours on this job from my submitted dailies, by day, week or month, and my contract hours
// (Contract / Used / Remaining from the baseline). A day opens in the right column to set its hours; the contract card
// opens its form there. Everything here is mine only.
import { useHoursBudget, useMyHours } from '../../data/hours.queries';
import { useProject } from '../../data/queries';
import { todayInZone } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { BudgetCard } from './BudgetCard';
import { HoursList } from './HoursList';
import { CONTRACT_ITEM, HOURS_VIEWS, hoursMeta, jobBudget, type HoursView } from './model';
import { useHoursNav } from './useHoursNav';

interface HoursToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

const META = TOOL_META.hours;

interface HeaderProps {
  meta?: string | undefined;
  view: HoursView;
  onView: (v: HoursView) => void;
}

function HoursHeader({ meta, view, onView }: HeaderProps) {
  return (
    <PageHeader
      title={META.label}
      icon={META.icon}
      meta={meta}
      below={<Segments options={HOURS_VIEWS} value={view} onPick={onView} label="Hours" testId="hours-view" />}
    />
  );
}

export function HoursTool({ projectId, itemId, isPhone }: HoursToolProps) {
  const nav = useHoursNav(projectId);
  const days = useMyHours(projectId);
  const budget = useHoursBudget(projectId);
  const project = useProject(projectId);

  const openContract = () => {
    nav.open(CONTRACT_ITEM);
  };
  const header = (meta?: string) => <HoursHeader meta={meta} view={nav.view} onView={nav.setView} />;

  if (days.isError || budget.isError || project.isError) {
    return (
      <div className="mx-auto max-w-3xl">
        {header()}
        <ErrorState
          error={days.error ?? budget.error ?? project.error}
          onRetry={() => {
            void days.refetch();
            void budget.refetch();
            void project.refetch();
          }}
        />
      </div>
    );
  }
  if (days.isPending || budget.isPending || project.isPending) {
    return (
      <div className="mx-auto max-w-3xl">
        {header()}
        <Card>
          <LoadingState label="Loading hours" />
        </Card>
      </div>
    );
  }

  const row = jobBudget(budget.data, days.data);
  const thisMonth = todayInZone(project.data.timezone).slice(0, 7);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4" data-testid="hours-tool">
      {header(hoursMeta(days.data, thisMonth, row))}
      <BudgetCard budget={row} onEdit={openContract} />
      <Card padded={false} className="overflow-hidden">
        {days.data.length === 0 ? (
          <EmptyState icon={META.icon} title="No submitted dailies yet." />
        ) : (
          <HoursList view={nav.view} days={days.data} selectedId={itemId} onOpen={nav.open} isPhone={isPhone} />
        )}
      </Card>
    </div>
  );
}
