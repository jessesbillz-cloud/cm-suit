// Inspections (SPEC §13.2, §18.4 P1). Requesters see the job's week and their log; inspectors start on their day, and
// so does the deputy, on the OFS requests sent to OFS (the database gives him nothing else); the GC review list shows
// when the job has the GC step on or takes OFS requests. What shows is decided by has_capability, never role names.
import { CalendarOff, Plus, QrCode } from 'lucide-react';
import { useIrCalendar } from '../../data/inspections.queries';
import { todayInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { DayView } from './DayView';
import { LogView } from './LogView';
import { BLOCK_ITEM, NEW_ITEM, SHARE_ITEM, VIEW_LABELS, dayMeta, viewsFor, type IrView } from './model';
import { ReviewView } from './ReviewView';
import { useInspectionsNav } from './useInspectionsNav';
import { seesInspections, useIrAccess, type IrCan, type IrJob } from './useIrAccess';
import { WeekView } from './WeekView';

const META = TOOL_META.inspections;

interface InspectionsToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

interface MainProps extends InspectionsToolProps {
  can: IrCan;
  job: IrJob;
}

/** "Today · 3 requests · 1 pending", from the same live calendar the day view reads. */
function TodayLine({ projectId, today, ofsDecide }: { projectId: string; today: string; ofsDecide: boolean }) {
  const cal = useIrCalendar(projectId, today, today);
  if (!cal.data) return null;
  return <span data-testid="ir-meta">{dayMeta(cal.data, ofsDecide)}</span>;
}

function InspectionsMain({ projectId, itemId, isPhone, can, job }: MainProps) {
  const today = todayInZone(job.tz);
  // Whoever inspects: the inspector, or the deputy on his OFS requests.
  const inspects = can.decide || can.ofsDecide;
  // An OFS request always takes the GC step, even with the job's own step off.
  const views = viewsFor({ decide: inspects, review: can.gcApprove && (job.gcStep || job.ofs) });
  const nav = useInspectionsNav(projectId, views, today);
  const options = views.map((v) => ({ value: v, label: VIEW_LABELS[v] }));
  const common = { projectId, selectedId: itemId, onOpen: nav.open };
  const request = can.request
    ? () => {
        nav.open(NEW_ITEM);
      }
    : undefined;

  return (
    <div className="mx-auto flex max-w-6xl flex-col" data-testid="inspections">
      <PageHeader
        title={META.label}
        icon={META.icon}
        meta={<TodayLine projectId={projectId} today={today} ofsDecide={can.ofsDecide} />}
        actions={
          <>
            {can.share || can.decide ? (
              <Button
                icon={QrCode}
                aria-label={isPhone ? 'Share' : undefined}
                title="Request link and QR sheet"
                className={isPhone ? 'h-10' : ''}
                data-testid="ir-share-open"
                onClick={() => {
                  nav.open(SHARE_ITEM);
                }}
              >
                {isPhone ? null : 'Share'}
              </Button>
            ) : null}
            {can.decide ? (
              <Button
                icon={CalendarOff}
                // The phone keeps the header to one line: the icon alone, named for screen readers.
                aria-label={isPhone ? 'Block time' : undefined}
                title="Block time"
                className={isPhone ? 'h-10' : ''}
                onClick={() => {
                  nav.open(BLOCK_ITEM);
                }}
              >
                {isPhone ? null : 'Block time'}
              </Button>
            ) : null}
            {request ? (
              <Button variant="primary" icon={Plus} className={isPhone ? 'h-10' : ''} data-testid="ir-new" onClick={request}>
                Request
              </Button>
            ) : null}
          </>
        }
        below={
          options.length > 1 ? <Segments<IrView> label="View" options={options} value={nav.view} onPick={nav.setView} testId="ir-view" /> : undefined
        }
      />
      {nav.view === 'day' ? <DayView {...common} can={can} day={nav.day} today={today} onDay={nav.setDay} onRequest={request} /> : null}
      {nav.view === 'week' ? (
        <WeekView
          {...common}
          day={nav.day}
          today={today}
          isPhone={isPhone}
          ofsDecide={can.ofsDecide}
          onDay={nav.setDay}
          onPickDay={(d) => {
            nav.showDay(d, inspects ? 'day' : 'week');
          }}
        />
      ) : null}
      {nav.view === 'log' ? <LogView {...common} tz={job.tz} day={nav.day} isPhone={isPhone} ofsDecide={can.ofsDecide} /> : null}
      {nav.view === 'review' ? <ReviewView {...common} /> : null}
    </div>
  );
}

export function InspectionsTool({ projectId, itemId, isPhone }: InspectionsToolProps) {
  const access = useIrAccess(projectId);
  if (access.state === 'loading') return <LoadingState label="Loading inspections" />;
  if (access.state === 'error') return <ErrorState error={access.error} onRetry={access.retry} />;
  const { can, job } = access;
  if (!seesInspections(can)) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title={META.label} icon={META.icon} />
        <Card>
          <EmptyState icon={META.icon} title="No inspections for you on this job." />
        </Card>
      </div>
    );
  }
  return <InspectionsMain key={projectId} projectId={projectId} itemId={itemId} isPhone={isPhone} can={can} job={job} />;
}
