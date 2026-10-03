// Schedule (0062): the GC's schedule as the job's look-ahead. Look-ahead (3 weeks or 2 months: what is underway, then
// each week's starts), Activities (all of them, searchable) and Updates (each upload with its data date). The header
// says which update is current and when an update is due (data date over 35 days back). Upload takes any schedule file
// and opens its draft for review; a draft's review fills the main area. What shows is decided by has_capability.
import type { ReactNode } from 'react';
import { useCapability } from '../../data/queries';
import { useCurrentActivities, useScheduleStatus } from '../../data/schedule.queries';
import type { ScheduleStatus } from '../../data/schedule.types';
import { formatDay } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { ActivitiesView } from './ActivitiesView';
import { DraftPage } from './DraftPage';
import { LookAheadView } from './LookAheadView';
import { draftItemId, itemRef, VIEWS, type ScheduleView } from './model';
import { UpdatesView } from './UpdatesView';
import { UploadButton } from './UploadButton';
import { useScheduleNav } from './useScheduleNav';

const META = TOOL_META.schedule;

interface ScheduleToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

function Shell({ meta, actions, below, children }: { meta?: ReactNode; actions?: ReactNode; below?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col" data-testid="schedule">
      <PageHeader title={META.label} icon={META.icon} meta={meta} actions={actions} below={below} />
      {children}
    </div>
  );
}

function StatusMeta({ status }: { status: ScheduleStatus }) {
  if (status.number === null || status.data_date === null) return null;
  return (
    <span data-testid="schedule-status">
      Update {status.number} · Data date {formatDay(status.data_date, 'MMM d')}
      {status.update_due ? <span className="font-medium text-danger"> · Update due</span> : null}
    </span>
  );
}

interface MainProps extends ScheduleToolProps {
  canManage: boolean;
}

function ScheduleMain({ projectId, itemId, canManage }: MainProps) {
  const nav = useScheduleNav(projectId);
  const status = useScheduleStatus(projectId);
  const hasCurrent = status.data ? status.data.current_id !== null : false;
  const current = useCurrentActivities(projectId, hasCurrent);
  const openDraft = (versionId: string) => {
    nav.open(draftItemId(versionId));
  };
  const upload = canManage ? <UploadButton projectId={projectId} onDraft={openDraft} /> : undefined;
  const below = <Segments<ScheduleView> label="View" options={VIEWS} value={nav.view} onPick={nav.setView} testId="schedule-view" />;
  const selectedId = itemId === null ? null : itemRef(itemId).id;

  let body: ReactNode;
  if (nav.view === 'updates') {
    body = <UpdatesView projectId={projectId} selectedId={itemId} onOpen={nav.open} upload={upload} />;
  } else if (status.isError) {
    body = <Card padded={false}><ErrorState error={status.error} onRetry={() => void status.refetch()} /></Card>;
  } else if (!status.data) {
    body = <Card padded={false}><LoadingState label="Loading the schedule" /></Card>;
  } else if (!hasCurrent) {
    const drafts = status.data.drafts;
    const action = drafts > 0
      ? <Button variant="primary" onClick={() => { nav.setView('updates'); }}>{drafts === 1 ? 'Review the draft' : `Review ${String(drafts)} drafts`}</Button>
      : upload;
    body = <Card><EmptyState icon={META.icon} title="No schedule yet." action={action} /></Card>;
  } else if (current.isError) {
    body = <Card padded={false}><ErrorState error={current.error} onRetry={() => void current.refetch()} /></Card>;
  } else if (!current.data) {
    body = <Card padded={false}><LoadingState label="Loading the activities" /></Card>;
  } else if (nav.view === 'activities') {
    body = <ActivitiesView activities={current.data} selectedId={selectedId} onOpen={nav.open} />;
  } else {
    body = (
      <LookAheadView
        activities={current.data}
        today={status.data.today}
        range={nav.range}
        onRange={nav.setRange}
        selectedId={selectedId}
        onOpen={nav.open}
      />
    );
  }
  return (
    <Shell meta={status.data ? <StatusMeta status={status.data} /> : undefined} actions={upload} below={below}>
      {body}
    </Shell>
  );
}

export function ScheduleTool({ projectId, itemId, isPhone }: ScheduleToolProps) {
  const read = useCapability(projectId, 'schedule.read');
  const manage = useCapability(projectId, 'schedule.manage');
  const caps = [read, manage];
  const capError = caps.find((q) => q.isError)?.error;
  if (capError) {
    return (
      <Shell>
        <ErrorState error={capError} onRetry={() => { for (const q of caps) void q.refetch(); }} />
      </Shell>
    );
  }
  if (caps.some((q) => q.isPending)) {
    return (
      <Shell>
        <Card padded={false}>
          <LoadingState label="Loading the schedule" />
        </Card>
      </Shell>
    );
  }
  if (!read.data) {
    return (
      <Shell>
        <Card>
          <EmptyState icon={META.icon} title="You can't see the schedule on this job." />
        </Card>
      </Shell>
    );
  }
  // A draft's review is a page of its own: it fills the main area (lib/itemIds opensInMain).
  if (itemId !== null && itemRef(itemId).kind === 'draft') {
    return <DraftPage key={itemId} projectId={projectId} versionId={itemRef(itemId).id} isPhone={isPhone} />;
  }
  return <ScheduleMain key={projectId} projectId={projectId} itemId={itemId} isPhone={isPhone} canManage={manage.data === true} />;
}
