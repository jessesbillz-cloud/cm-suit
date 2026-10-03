// Safety (0060): tailgate safety meetings and any job meeting, signed in from a QR with no login, and the talks to read.
// Meetings: newest first with their number, title, day, leader, how many signed, open or closed; a tap opens one beside
// the list (its own screen on a phone). Library: the built-in starter talks and the company's own, by category and
// search. The header says when the next tailgate is due (Cal/OSHA: every 10 working days). What shows is decided by
// has_capability, never role names.
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useCapability, useProject } from '../../data/queries';
import { useSafetyDue } from '../../data/safety.queries';
import type { SafetyDue } from '../../data/safety.types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { LibraryView } from './LibraryView';
import { MeetingsView } from './MeetingsView';
import { dueLine, NEW_ITEM, NEW_TOPIC_ITEM, VIEWS, type SafetyView } from './model';
import { useSafetyNav } from './useSafetyNav';

const META = TOOL_META.safety;

interface SafetyToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

interface ShellProps {
  meta?: ReactNode;
  actions?: ReactNode;
  below?: ReactNode;
  children: ReactNode;
}

function Shell({ meta, actions, below, children }: ShellProps) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col" data-testid="safety">
      <PageHeader title={META.label} icon={META.icon} meta={meta} actions={actions} below={below} />
      {children}
    </div>
  );
}

function DueMeta({ due }: { due: SafetyDue }) {
  const line = dueLine(due);
  return (
    <span data-testid="safety-due">
      <span className={line.late ? 'font-medium text-danger' : ''}>{line.text}</span>
      {due.open_count > 0 ? <span> · {due.open_count} open</span> : null}
    </span>
  );
}

interface MainProps extends SafetyToolProps {
  canRun: boolean;
  canManage: boolean;
}

function SafetyMain({ projectId, itemId, isPhone, canRun, canManage }: MainProps) {
  const nav = useSafetyNav(projectId);
  const due = useSafetyDue(projectId);
  const project = useProject(projectId);
  const library = nav.view === 'library';
  const action = library ? (
    canManage ? (
      <Button variant="primary" icon={Plus} data-testid="safety-new-topic" onClick={() => { nav.open(NEW_TOPIC_ITEM); }}>
        Add topic
      </Button>
    ) : undefined
  ) : canRun ? (
    <Button variant="primary" icon={Plus} data-testid="safety-new" onClick={() => { nav.open(NEW_ITEM); }}>
      New meeting
    </Button>
  ) : undefined;
  const below = <Segments<SafetyView> label="View" options={VIEWS} value={nav.view} onPick={nav.setView} testId="safety-view" />;

  let body: ReactNode;
  if (!library) {
    body = (
      <MeetingsView
        projectId={projectId}
        selectedId={itemId}
        isPhone={isPhone}
        onOpen={nav.open}
        onNew={canRun ? () => { nav.open(NEW_ITEM); } : undefined}
      />
    );
  } else if (project.isError) {
    body = <Card padded={false}><ErrorState error={project.error} onRetry={() => void project.refetch()} /></Card>;
  } else if (!project.data) {
    body = <Card padded={false}><LoadingState label="Loading the library" /></Card>;
  } else {
    body = <LibraryView orgId={project.data.org_id} selectedId={itemId} onOpen={nav.open} />;
  }
  return (
    <Shell meta={due.data ? <DueMeta due={due.data} /> : undefined} actions={action} below={below}>
      {due.isError ? <ErrorState error={due.error} onRetry={() => void due.refetch()} className="mb-3 mt-0" /> : null}
      {body}
    </Shell>
  );
}

export function SafetyTool({ projectId, itemId, isPhone }: SafetyToolProps) {
  const read = useCapability(projectId, 'safety.read');
  const run = useCapability(projectId, 'safety.run');
  const manage = useCapability(projectId, 'safety.manage');
  const caps = [read, run, manage];
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
          <LoadingState label="Loading safety" />
        </Card>
      </Shell>
    );
  }
  if (!read.data) {
    return (
      <Shell>
        <Card>
          <EmptyState icon={META.icon} title="You can't see safety meetings on this job." />
        </Card>
      </Shell>
    );
  }
  return <SafetyMain key={projectId} projectId={projectId} itemId={itemId} isPhone={isPhone} canRun={run.data === true} canManage={manage.data === true} />;
}
