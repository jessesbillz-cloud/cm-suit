// Inspections (SPEC §13.2). Requesters see the job's week and their log; inspectors start on their day; the GC review
// list shows only when the job has the GC step on. What shows is decided by has_capability, never role names.
import { CalendarOff, Plus } from 'lucide-react';
import { todayInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { ChoiceRow } from './ChoiceRow';
import { DayView } from './DayView';
import { LogView } from './LogView';
import { BLOCK_ITEM, NEW_ITEM, VIEW_LABELS, viewsFor, type IrView } from './model';
import { ReviewView } from './ReviewView';
import { useInspectionsNav } from './useInspectionsNav';
import { useIrAccess, type IrCan, type IrJob } from './useIrAccess';
import { WeekView } from './WeekView';

interface InspectionsToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

interface MainProps extends InspectionsToolProps {
  can: IrCan;
  job: IrJob;
}

function InspectionsMain({ projectId, itemId, isPhone, can, job }: MainProps) {
  const today = todayInZone(job.tz);
  const views = viewsFor({ decide: can.decide, review: job.gcStep && can.gcApprove });
  const nav = useInspectionsNav(projectId, views, today);
  const options = views.map((v) => ({ value: v, label: VIEW_LABELS[v] }));
  const common = { projectId, selectedId: itemId, onOpen: nav.open };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3" data-testid="inspections">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChoiceRow<IrView> label="View" options={options} value={nav.view} onPick={nav.setView} testId="ir-view" />
        <div className="flex gap-2">
          {can.decide ? (
            <Button
              icon={CalendarOff}
              onClick={() => {
                nav.open(BLOCK_ITEM);
              }}
            >
              Block time
            </Button>
          ) : null}
          {can.request ? (
            <Button
              variant="primary"
              icon={Plus}
              data-testid="ir-new"
              onClick={() => {
                nav.open(NEW_ITEM);
              }}
            >
              Request
            </Button>
          ) : null}
        </div>
      </div>
      {nav.view === 'day' ? <DayView {...common} day={nav.day} today={today} onDay={nav.setDay} /> : null}
      {nav.view === 'week' ? (
        <WeekView
          {...common}
          day={nav.day}
          today={today}
          isPhone={isPhone}
          onDay={nav.setDay}
          onPickDay={(d) => {
            nav.showDay(d, can.decide ? 'day' : 'week');
          }}
        />
      ) : null}
      {nav.view === 'log' ? <LogView {...common} tz={job.tz} day={nav.day} /> : null}
      {nav.view === 'review' ? <ReviewView {...common} /> : null}
    </div>
  );
}

export function InspectionsTool({ projectId, itemId, isPhone }: InspectionsToolProps) {
  const access = useIrAccess(projectId);
  if (access.state === 'loading') return <LoadingState label="Loading inspections" />;
  if (access.state === 'error') return <ErrorState error={access.error} onRetry={access.retry} />;
  const { can, job } = access;
  if (!can.request && !can.viewAll && !can.decide) {
    return (
      <Card>
        <EmptyState title="No inspections for you on this job." />
      </Card>
    );
  }
  return <InspectionsMain key={projectId} projectId={projectId} itemId={itemId} isPhone={isPhone} can={can} job={job} />;
}
