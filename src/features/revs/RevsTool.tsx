// Revs (0056): a fire marshal job's rated walls and the revs each must pass (Jesse, Oct 2: "anyone can see what's left
// on each wall at any time"). Walls: every wall by level as a callout tile with its tally; a tap opens the wall's own
// page (the main area; its own screen on the phone). Open: the end-of-job check, what is still open and where. Setup
// (revs.manage): the lists, pasted from OSFM's legend, and the walls. What shows is decided by has_capability, never
// role names.
import { useMemo, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useCapability } from '../../data/queries';
import { useRevSetup, useRevStatus } from '../../data/revs.queries';
import { NEW_ITEM, opensInMain, WALLS_ITEM } from '../../lib/itemIds';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { VIEWS, VIEW_LABELS, indexStatus, metaLine, type RevView } from './model';
import { OpenView } from './OpenView';
import { SetupView } from './SetupView';
import { useRevsNav } from './useRevsNav';
import { WallPage } from './WallPage';
import { WallsView } from './WallsView';

const META = TOOL_META.revs;

interface RevsToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

interface ShellProps {
  meta?: string | undefined;
  actions?: ReactNode;
  below?: ReactNode;
  children: ReactNode;
}

function Shell({ meta, actions, below, children }: ShellProps) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col" data-testid="revs">
      <PageHeader title={META.label} icon={META.icon} meta={meta} actions={actions} below={below} />
      {children}
    </div>
  );
}

interface MainProps extends RevsToolProps {
  canManage: boolean;
}

function SetupActions({ onOpen, hasLists, isPhone }: { onOpen: (id: string) => void; hasLists: boolean; isPhone: boolean }) {
  return (
    <>
      {hasLists ? (
        <Button icon={Plus} className={isPhone ? 'h-10' : ''} data-testid="rev-add-walls" onClick={() => { onOpen(WALLS_ITEM); }}>
          Add walls
        </Button>
      ) : null}
      <Button variant="primary" icon={Plus} className={isPhone ? 'h-10' : ''} data-testid="rev-new-list" onClick={() => { onOpen(NEW_ITEM); }}>
        New list
      </Button>
    </>
  );
}

function RevsMain({ projectId, itemId, isPhone, canManage }: MainProps) {
  const nav = useRevsNav(projectId, canManage);
  const setup = useRevSetup(projectId);
  const status = useRevStatus(projectId);
  const index = useMemo(() => indexStatus(status.data ?? []), [status.data]);
  const views = VIEWS.filter((v) => v !== 'setup' || canManage).map((v) => ({ value: v, label: VIEW_LABELS[v] }));
  const view = nav.view;
  const meta = setup.data && status.data && setup.data.areas.length > 0 ? metaLine(setup.data, index) : undefined;
  const needsStatus = view !== 'setup';

  let body: ReactNode;
  if (setup.isError || (needsStatus && status.isError)) {
    const failed = setup.isError ? setup : status;
    body = (
      <Card padded={false}>
        <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />
      </Card>
    );
  } else if (!setup.data || (needsStatus && !status.data)) {
    body = (
      <Card padded={false}>
        <LoadingState label="Loading revs" />
      </Card>
    );
  } else if (view === 'setup') {
    body = <SetupView projectId={projectId} setup={setup.data} isPhone={isPhone} onNewList={() => { nav.open(NEW_ITEM); }} />;
  } else if (view === 'open') {
    body = <OpenView setup={setup.data} index={index} selectedId={itemId} onOpen={nav.open} />;
  } else {
    body = (
      <WallsView
        setup={setup.data}
        index={index}
        onOpen={nav.open}
        onSetup={canManage ? () => { nav.setView('setup'); } : undefined}
      />
    );
  }

  return (
    <Shell
      meta={meta}
      actions={view === 'setup' ? <SetupActions onOpen={nav.open} hasLists={(setup.data?.lists.length ?? 0) > 0} isPhone={isPhone} /> : undefined}
      below={<Segments<RevView> label="View" options={views} value={view} onPick={nav.setView} testId="rev-view" />}
    >
      {body}
    </Shell>
  );
}

export function RevsTool({ projectId, itemId, isPhone }: RevsToolProps) {
  const read = useCapability(projectId, 'revs.read');
  const manage = useCapability(projectId, 'revs.manage');
  const capError = [read, manage].find((q) => q.isError)?.error;
  if (capError) {
    return (
      <Shell>
        <ErrorState error={capError} onRetry={() => { void read.refetch(); void manage.refetch(); }} />
      </Shell>
    );
  }
  if (read.isPending || manage.isPending) {
    return (
      <Shell>
        <Card padded={false}>
          <LoadingState label="Loading revs" />
        </Card>
      </Shell>
    );
  }
  if (!read.data) {
    return (
      <Shell>
        <Card>
          <EmptyState icon={META.icon} title="You can't see revs on this job." />
        </Card>
      </Shell>
    );
  }
  // A wall is a page of its own: it fills the main area (lib/itemIds opensInMain).
  if (itemId !== null && opensInMain('revs', itemId)) return <WallPage key={itemId} projectId={projectId} areaId={itemId} isPhone={isPhone} />;
  return <RevsMain key={projectId} projectId={projectId} itemId={itemId} isPhone={isPhone} canManage={manage.data === true} />;
}
