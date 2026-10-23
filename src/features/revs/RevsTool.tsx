// Revs (0056), "Inspection cards" on the rail (Jesse, Oct 12): a fire marshal job's rated walls and the revs each must
// pass. Oct 23: "there's redundant information everywhere ... I liked the 3-D image of the wall front and center: click
// the room, the room opens with each of its walls, click a wall and boom". So it opens on the rooms of the level picked
// (the level chips; All shows every level), a tile per room that opens its page; a wall's page is the 3-D wall. The
// Walls and Open views are gone (the rooms and the wall pages show the same). Whoever manages the cards also has the
// Plan (the level's sheet with its walls: where a wall is placed, which the request maps draw from) and Setup, and the
// fire marshal's printable Checklist is a button for them (it opens the sheet with Print). Whoever files OFS requests
// adds a wall on the spot (Add wall) and builds the request as he walks: its bar sits at the bottom of every screen
// here (0113). The header says, per list, how many and how many are complete. What shows is decided by
// has_capability, never role names.
import { useMemo, type ReactNode } from 'react';
import { ArrowLeft, ListChecks, Plus, Printer } from 'lucide-react';
import { useCapability, useMyProjects } from '../../data/queries';
import { useSignoffFiles } from '../../data/revs.history';
import { useRevSetup, useRevStatus } from '../../data/revs.queries';
import { useRevRooms } from '../../data/revs.rooms';
import { BASKET_ITEM, FIELD_WALL_ITEM, NEW_ITEM, opensInMain, ROOM_ITEM_PREFIX, WALLS_ITEM } from '../../lib/itemIds';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { BasketBar } from './basket/BasketBar';
import { BasketReview } from './basket/BasketReview';
import { useBasket } from './basket/useBasket';
import { ChecklistView } from './ChecklistView';
import { AddWallPage } from './field/AddWallPage';
import type { ItemChip } from './itemLines';
import { LevelChips } from './LevelChips';
import { jobLevels, pickedLevel, planLevel } from './levels';
import { indexStatus, listLines } from './model';
import { PlanView } from './plan/PlanView';
import { indexSignoffFiles } from './revStrip';
import { RoomPage } from './room/RoomPage';
import { RoomsView } from './RoomsView';
import { SetupView } from './SetupView';
import { useOpenRevFile } from './useOpenRevFile';
import { useRevsNav } from './useRevsNav';
import { WallPage } from './WallPage';

const META = TOOL_META.revs;

/** A manager's row: the rooms, the plan, setup. */
type Tab = 'rooms' | 'plan' | 'setup';

const TABS: { value: Tab; label: string }[] = [
  { value: 'rooms', label: 'Rooms' },
  { value: 'plan', label: 'Plan' },
  { value: 'setup', label: 'Setup' },
];

interface RevsToolProps {
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
    <div className="flex min-h-full flex-col" data-testid="revs">
      <PageHeader title={META.label} icon={META.icon} meta={meta} actions={actions} below={below} />
      {children}
    </div>
  );
}

/** Per list: "Rated walls 48 · 3 complete". */
function Meta({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-x-4" data-testid="rev-meta">
      {lines.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </span>
  );
}

interface MainProps extends RevsToolProps {
  canManage: boolean;
}

function SetupActions({ hasLists, onOpen, isPhone }: { hasLists: boolean; onOpen: (id: string) => void; isPhone: boolean }) {
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

function RevsMain({ projectId, isPhone, canManage }: MainProps) {
  const nav = useRevsNav(projectId, canManage);
  const setup = useRevSetup(projectId);
  const status = useRevStatus(projectId);
  const rooms = useRevRooms(projectId);
  const signoffs = useSignoffFiles(projectId);
  const jobs = useMyProjects();
  const basket = useBasket(projectId);
  const openFile = useOpenRevFile(projectId);
  const index = useMemo(() => indexStatus(status.data ?? []), [status.data]);
  const files = useMemo(() => indexSignoffFiles(signoffs.data ?? []), [signoffs.data]);
  const levels = useMemo(() => jobLevels([...(setup.data?.areas ?? []), ...(rooms.data?.rooms ?? [])]), [setup.data, rooms.data]);
  const view = nav.view;
  const tab: Tab = nav.plan ? 'plan' : view === 'setup' ? 'setup' : 'rooms';
  const level = pickedLevel(nav.level, levels);
  const onPlan = planLevel(nav.level, levels, canManage);
  const inRoom = new Set((rooms.data?.walls ?? []).map((w) => w.area_id));
  const meta = setup.data && status.data ? <Meta lines={listLines(setup.data, index, inRoom)} /> : undefined;
  const needsStatus = view !== 'setup';
  const needsRooms = view === 'walls' && !nav.plan;
  const placing = nav.plan && canManage && nav.planAt.place !== undefined;
  const chipLevels = nav.plan && onPlan !== null && !levels.includes(onPlan) ? [...levels, onPlan] : levels;
  const toSetup = canManage ? () => { nav.setView('setup'); } : undefined;
  // A passed item with its OFS IR on file opens it; any other item opens the wall at that item.
  const onChip = (areaId: string, chip: ItemChip) => {
    if (chip.fileId !== null) openFile(chip.fileId);
    else nav.open(areaId, chip.item.id);
  };

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
        <LoadingState label="Loading the cards" />
      </Card>
    );
  } else if (view === 'setup') {
    body = <SetupView projectId={projectId} setup={setup.data} isPhone={isPhone} onNewList={() => { nav.open(NEW_ITEM); }} />;
  } else if (view === 'checklist') {
    const jobName = jobs.data?.find((p) => p.project_id === projectId)?.name ?? '';
    body = <ChecklistView setup={setup.data} index={index} jobName={jobName} onOpen={nav.open} />;
  } else if (nav.plan) {
    body = <PlanView projectId={projectId} setup={setup.data} index={index} level={onPlan} canManage={canManage} isPhone={isPhone} />;
  } else if (rooms.data) {
    body = (
      <RoomsView
        projectId={projectId}
        setup={setup.data}
        index={index}
        rooms={rooms.data}
        files={files}
        level={level}
        onOpenRoom={nav.openRoom}
        onOpenWall={nav.open}
        onChip={onChip}
        onSetup={toSetup}
      />
    );
  }

  const checklist = view === 'checklist';
  // A manager adds walls in Setup and on the Plan; the field adds the one he stands at.
  const mayAdd = basket.can && !canManage && (setup.data?.lists.length ?? 0) > 0;
  const actions =
    view === 'setup' ? (
      <SetupActions hasLists={(setup.data?.lists ?? []).length > 0} onOpen={nav.open} isPhone={isPhone} />
    ) : checklist ? (
      <>
        <Button icon={ArrowLeft} className={isPhone ? 'h-10' : ''} data-testid="rev-checklist-back" onClick={() => { nav.setView('walls'); }}>
          Rooms
        </Button>
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
      </>
    ) : (
      <>
        {canManage && !nav.plan ? (
          <Button icon={ListChecks} className={isPhone ? 'h-10' : ''} data-testid="rev-checklist-open" onClick={() => { nav.setView('checklist'); }}>
            Checklist
          </Button>
        ) : null}
        {mayAdd && !nav.plan ? (
          <Button icon={Plus} className={isPhone ? 'h-10' : ''} data-testid="rev-add-wall" onClick={() => { nav.addWall(); }}>
            Add wall
          </Button>
        ) : null}
      </>
    );
  const below =
    checklist || placing ? undefined : (
      <div className="flex flex-col gap-2.5">
        {canManage ? (
          <Segments<Tab>
            label="View"
            options={TABS}
            value={tab}
            onPick={(t) => {
              if (t === 'plan') nav.showPlan({});
              else nav.setView(t === 'setup' ? 'setup' : 'walls');
            }}
            testId="rev-view"
          />
        ) : null}
        {view === 'walls' ? <LevelChips levels={chipLevels} level={nav.plan ? onPlan : level} withAll={!nav.plan} onLevel={nav.setLevel} /> : null}
      </div>
    );

  return (
    <Shell meta={meta} actions={actions} below={below}>
      {signoffs.isError && view === 'walls' ? (
        <ErrorState className="mb-3" error={signoffs.error} title="The OFS IR files did not load." onRetry={() => void signoffs.refetch()} />
      ) : null}
      <div className="flex-1">{body}</div>
      <BasketBar basket={basket} onReview={nav.review} isPhone={isPhone} />
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
          <LoadingState label="Loading the cards" />
        </Card>
      </Shell>
    );
  }
  if (!read.data) {
    return (
      <Shell>
        <Card>
          <EmptyState icon={META.icon} title="You can't see inspection cards on this job." />
        </Card>
      </Shell>
    );
  }
  // A wall, a room, the request being built and a wall added on the spot are pages of their own (lib/itemIds opensInMain).
  if (itemId === BASKET_ITEM) return <BasketReview projectId={projectId} isPhone={isPhone} />;
  if (itemId === FIELD_WALL_ITEM) return <AddWallPage projectId={projectId} isPhone={isPhone} canManage={manage.data === true} />;
  if (itemId !== null && itemId.startsWith(ROOM_ITEM_PREFIX)) {
    return <RoomPage key={itemId} projectId={projectId} roomId={itemId.slice(ROOM_ITEM_PREFIX.length)} isPhone={isPhone} />;
  }
  if (itemId !== null && opensInMain('revs', itemId)) return <WallPage key={itemId} projectId={projectId} areaId={itemId} isPhone={isPhone} />;
  return <RevsMain key={projectId} projectId={projectId} itemId={itemId} isPhone={isPhone} canManage={manage.data === true} />;
}
