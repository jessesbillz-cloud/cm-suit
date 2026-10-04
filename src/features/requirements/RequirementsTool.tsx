// Requirements (migration 0069): what the spec book commits people to beyond the submittals (owner-furnished items and
// their notice, tests and witnesses, manufacturer's reps, special warranties, training, attic stock, closeout documents,
// notices, mockups), each with who does it and when it is due. Due: the next 60 days and everything late. All: by kind
// or by section. Drafts: what the AI read in a spec section, kept or dropped one by one. What shows is decided by
// has_capability, never role names.
import type { ReactNode } from 'react';
import { Plus, ScanText } from 'lucide-react';
import { useCapability } from '../../data/queries';
import { useRequirements } from '../../data/requirements.queries';
import type { Requirement } from '../../data/requirements.types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { AllView } from './AllView';
import { DraftsView } from './DraftsView';
import { DueView } from './DueView';
import { draftRows, dueRows, GROUPINGS, headerCounts, keptRows, NEW_ITEM, READ_ITEM, viewsFor, type Grouping } from './model';
import { useRequirementsNav } from './useRequirementsNav';

const META = TOOL_META.requirements;

interface RequirementsToolProps {
  projectId: string;
  itemId: string | null;
  /** The frame passes it to every tool; the lists here are one stacked layout for both. */
  isPhone: boolean;
}

function Shell({ meta, actions, below, children }: { meta?: ReactNode; actions?: ReactNode; below?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col" data-testid="requirements">
      <PageHeader title={META.label} icon={META.icon} meta={meta} actions={actions} below={below} />
      {children}
    </div>
  );
}

function Counts({ rows }: { rows: Requirement[] }) {
  const { late, soon } = headerCounts(rows);
  if (late === 0 && soon === 0) return <span data-testid="req-counts">Nothing due in 60 days</span>;
  return (
    <span data-testid="req-counts">
      {late > 0 ? <span className="font-medium text-danger">{late} late</span> : null}
      {late > 0 && soon > 0 ? ' · ' : null}
      {soon > 0 ? `${String(soon)} due in 60 days` : null}
    </span>
  );
}

interface MainProps {
  projectId: string;
  itemId: string | null;
  canManage: boolean;
}

function Body({ projectId, itemId, canManage, rows }: MainProps & { rows: Requirement[] }) {
  const nav = useRequirementsNav(projectId);
  const read = canManage ? (
    <Button variant="primary" icon={ScanText} onClick={() => { nav.open(READ_ITEM); }}>
      Read spec
    </Button>
  ) : undefined;
  if (nav.view === 'drafts') {
    const drafts = draftRows(rows);
    if (drafts.length === 0) return <EmptyState icon={META.icon} title="No drafts." action={read} />;
    return <DraftsView projectId={projectId} rows={drafts} selectedId={itemId} onOpen={nav.open} />;
  }
  if (nav.view === 'all') {
    const kept = keptRows(rows);
    if (kept.length === 0) return <EmptyState icon={META.icon} title="No requirements yet." action={read} />;
    return <AllView rows={kept} by={nav.by} selectedId={itemId} onOpen={nav.open} />;
  }
  const due = dueRows(rows);
  if (due.length === 0) return <EmptyState icon={META.icon} title="Nothing due in the next 60 days." />;
  return <DueView projectId={projectId} rows={due} selectedId={itemId} canManage={canManage} onOpen={nav.open} />;
}

function RequirementsMain({ projectId, itemId, canManage }: MainProps) {
  const nav = useRequirementsNav(projectId);
  const list = useRequirements(projectId);
  const drafts = list.data ? draftRows(list.data).length : 0;
  const actions = canManage ? (
    <>
      <Button icon={ScanText} data-testid="req-read" onClick={() => { nav.open(READ_ITEM); }}>
        Read spec
      </Button>
      <Button variant="primary" icon={Plus} data-testid="req-add" onClick={() => { nav.open(NEW_ITEM); }}>
        Add
      </Button>
    </>
  ) : undefined;
  const below = (
    <div className="flex flex-wrap items-center gap-2">
      <Segments label="View" options={viewsFor(canManage, drafts)} value={nav.view} onPick={nav.setView} testId="req-view" />
      {nav.view === 'all' ? (
        <Segments<Grouping> label="Group" kind="radio" options={GROUPINGS} value={nav.by} onPick={nav.setGrouping} testId="req-by" />
      ) : null}
    </div>
  );
  return (
    <Shell meta={list.data ? <Counts rows={list.data} /> : undefined} actions={actions} below={below}>
      <Card padded={false} className="overflow-hidden">
        {list.isPending ? <LoadingState label="Loading requirements" /> : null}
        {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
        {list.isSuccess ? <Body projectId={projectId} itemId={itemId} canManage={canManage} rows={list.data} /> : null}
      </Card>
    </Shell>
  );
}

export function RequirementsTool({ projectId, itemId }: RequirementsToolProps) {
  const read = useCapability(projectId, 'requirements.read');
  const manage = useCapability(projectId, 'requirements.manage');
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
          <LoadingState label="Loading requirements" />
        </Card>
      </Shell>
    );
  }
  if (!read.data) {
    return (
      <Shell>
        <Card>
          <EmptyState icon={META.icon} title="You can't see requirements on this job." />
        </Card>
      </Shell>
    );
  }
  return <RequirementsMain key={projectId} projectId={projectId} itemId={itemId} canManage={manage.data === true} />;
}
