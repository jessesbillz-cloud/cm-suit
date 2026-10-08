// Revs (0056): a fire marshal job's rated walls and the revs each must pass (Jesse, Oct 2: "anyone can see what's left
// on each wall at any time"). Walls: the rooms by level, each a tile that opens the room's page and its walls (Rooms,
// 0083, first), every wall by level as a callout tile with its tally (List), or the level's plan sheet with its walls
// drawn on it (Plan, 0059); a tap opens the wall's own page (the main area; its own screen on the phone). Open: the end-of-job check, what is still open and where. Checklist: the fire marshal's sheet, every wall by
// rev, printed letter landscape (0082). Setup (revs.manage): the lists, pasted from OSFM's
// legend, and the walls. What shows is decided by has_capability, never role names.
import { useMemo, type ReactNode } from 'react';
import { Plus, Printer } from 'lucide-react';
import { useCapability, useMyProjects } from '../../data/queries';
import { useRevSetup, useRevStatus } from '../../data/revs.queries';
import { useRevRooms } from '../../data/revs.rooms';
import { NEW_ITEM, opensInMain, ROOM_ITEM_PREFIX, WALLS_ITEM } from '../../lib/itemIds';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { ChecklistView } from './ChecklistView';
import { VIEWS, VIEW_LABELS, indexStatus, metaLine, type RevView } from './model';
import { OpenView } from './OpenView';
import { PlanView } from './plan/PlanView';
import { RoomPage } from './room/RoomPage';
import { RoomsView } from './RoomsView';
import { SetupView } from './SetupView';
import { useRevsNav, type WallsMode } from './useRevsNav';
import { WallPage } from './WallPage';
import { WallsView } from './WallsView';

const META = TOOL_META.revs;

/** One row of views, always all there (Jesse, Oct 5: the walls "kind of disappeared" once the views changed): the three
 *  ways to see the walls, then Open, Checklist and Setup. */
type RevTab = WallsMode | Exclude<RevView, 'walls'>;

const WALLS_TABS: { value: WallsMode; label: string }[] = [
  { value: 'rooms', label: 'Rooms' },
  { value: 'list', label: 'Walls' },
  { value: 'plan', label: 'Plan' },
];

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
    <div className="flex flex-col" data-testid="revs">
      <PageHeader title={META.label} icon={META.icon} meta={meta} actions={actions} below={below} />
      {children}
    </div>
  );
}

interface MainProps extends RevsToolProps {
  canManage: boolean;
}

interface SetupActionsProps {
  listIds: string[];
  onOpen: (id: string) => void;
  isPhone: boolean;
}

function SetupActions({ listIds, onOpen, isPhone }: SetupActionsProps) {
  const hasLists = listIds.length > 0;
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
  const rooms = useRevRooms(projectId);
  const jobs = useMyProjects();
  const index = useMemo(() => indexStatus(status.data ?? []), [status.data]);
  const tabs: { value: RevTab; label: string }[] = [
    ...WALLS_TABS,
    ...VIEWS.filter((v): v is Exclude<RevView, 'walls'> => v !== 'walls' && (v !== 'setup' || canManage)).map((v) => ({ value: v, label: VIEW_LABELS[v] })),
  ];
  const view = nav.view;
  const tab: RevTab = view === 'walls' ? nav.mode : view;
  const meta = setup.data && status.data && setup.data.areas.length > 0 ? metaLine(setup.data, index) : undefined;
  const needsStatus = view !== 'setup';
  const needsRooms = view === 'walls' && nav.mode === 'rooms';

  let body: ReactNode;
  if (setup.isError || (needsStatus && status.isError) || (needsRooms && rooms.isError)) {
    const failed = setup.isError ? setup : status.isError ? status : rooms;
    body = (
      <Card padded={false}>
        <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />
      </Card>
    );
  } else if (!setup.data || (needsStatus && !status.data) || (needsRooms && !rooms.data)) {
    body = (
      <Card padded={false}>
        <LoadingState label="Loading revs" />
      </Card>
    );
  } else if (view === 'setup') {
    body = <SetupView projectId={projectId} setup={setup.data} isPhone={isPhone} onNewList={() => { nav.open(NEW_ITEM); }} />;
  } else if (view === 'checklist') {
    const jobName = jobs.data?.find((p) => p.project_id === projectId)?.name ?? '';
    body = <ChecklistView setup={setup.data} index={index} jobName={jobName} onOpen={nav.open} />;
  } else if (view === 'open') {
    body = <OpenView setup={setup.data} index={index} selectedId={itemId} onOpen={nav.open} />;
  } else if (nav.plan) {
    body = <PlanView projectId={projectId} setup={setup.data} index={index} canManage={canManage} isPhone={isPhone} />;
  } else if (needsRooms && rooms.data) {
    body = (
      <RoomsView
        projectId={projectId}
        setup={setup.data}
        index={index}
        rooms={rooms.data}
        onOpenRoom={nav.openRoom}
        onOpenWall={nav.open}
        onSetup={canManage ? () => { nav.setView('setup'); } : undefined}
      />
    );
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
      actions={
        view === 'setup' ? (
          <SetupActions listIds={(setup.data?.lists ?? []).map((l) => l.id)} onOpen={nav.open} isPhone={isPhone} />
        ) : view === 'checklist' ? (
          <Button
            icon={Printer}
            className={isPhone ? 'h-10' : ''}
            disabled={!setup.data || !status.data || setup.data.areas.length === 0}
            data-testid="rev-print"
            onClick={() => {
              window.print();
            }}
          >
            Print
          </Button>
        ) : undefined
      }
      below={
        <Segments<RevTab>
          label="View"
          options={tabs}
          value={tab}
          onPick={(t) => {
            if (t === 'plan') nav.showPlan({});
            else if (t === 'rooms' || t === 'list') nav.setMode(t);
            else nav.setView(t);
          }}
          testId="rev-view"
        />
      }
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
  // A wall or a room is a page of its own: it fills the main area (lib/itemIds opensInMain).
  if (itemId !== null && itemId.startsWith(ROOM_ITEM_PREFIX)) {
    return <RoomPage key={itemId} projectId={projectId} roomId={itemId.slice(ROOM_ITEM_PREFIX.length)} isPhone={isPhone} />;
  }
  if (itemId !== null && opensInMain('revs', itemId)) return <WallPage key={itemId} projectId={projectId} areaId={itemId} isPhone={isPhone} />;
  return <RevsMain key={projectId} projectId={projectId} itemId={itemId} isPhone={isPhone} canManage={manage.data === true} />;
}
