// One wall's own inspection page (Jesse, Oct 3: "the whole wall gets built out on its own inspection page ... a 3-D
// version of it sitting there"; Oct 23: "I liked the 3-D image of the wall front and center ... click a wall and boom,
// there's its 3-D version"). One compact line (its name, tag and tally), then the 3-D wall at the top with each part
// tinted by its state, sized so the line, the drawing and the first row of items fit the first screen. One scroll
// (Jesse, Oct 23, 18:51: "I don't like the double scrolling ... shrink the wall down so it all fits on one screen at
// the top"): nothing is held in place; the items scroll with the page under the drawing. The items are big boxes in
// their state grouped by rev (WallItems): a tap shows the item on the wall with a leader and its facts under the
// drawing (the page brings the drawing back when it is off screen), a tap on the wall shows that part's item. Whoever
// files OFS requests has Add under each box still to ask for: it goes in the request being built (0113), whose bar is
// at the bottom. Everything else is below, quiet: its details and sheet, where it is in its room and on the plan, its
// photos and every inspection per item. A manager renames or removes the wall from the top line (Undo), checks one
// added on the spot (Confirm), and signs items or a whole rev off before the app (0082). Opened from an item's chip on
// its room's row (?item=), that item is shown. Opened from a room, Back goes to the room, else to its level. In its own
// window (?window=1) there is nothing to go back to.
import { useMemo, useState, type ReactNode } from 'react';
import { useSearch } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useCapability, useMyProjects, usePeopleDisplay } from '../../data/queries';
import { useConfirmFieldWall } from '../../data/revs.field';
import { useWallHistory } from '../../data/revs.history';
import { useRevSetup, useRevStatus } from '../../data/revs.queries';
import { useRevRooms } from '../../data/revs.rooms';
import { needsCheck, type RevArea, type RevSetup } from '../../data/revs.types';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { BasketBar } from './basket/BasketBar';
import { useBasket, type BasketApi } from './basket/useBasket';
import { indexStatus, wallRevs, type StatusIndex } from './model';
import { WallPhotos } from './photos/WallPhotos';
import { WallThumb } from './plan/WallThumb';
import { WallRoomPick } from './room/WallRoomPick';
import { roomLabel } from './rooms';
import { useOpenRevFile } from './useOpenRevFile';
import { useRevsNav } from './useRevsNav';
import { useShowWall } from './useShowWall';
import { Wall3D } from './wall3d/Wall3D';
import { useWidth } from './wall3d/useWidth';
import { SignoffForm, useSignoffActions, type SignTarget } from './WallBefore';
import { WallFacts } from './WallFacts';
import { WallHistory } from './WallHistory';
import { WallInfo } from './WallInfo';
import { WallItems } from './WallItems';
import { useWallManage } from './WallManage';
import { countOf, firstPick, partStates, pickAt, tapPart, wallItems, type WallItem, type WallPick } from './wallPage';
import { FieldCheck, WallTopLine } from './WallTopLine';

interface WallPageProps {
  projectId: string;
  areaId: string;
  isPhone: boolean;
}

interface BodyProps {
  projectId: string;
  area: RevArea;
  setup: RevSetup;
  index: StatusIndex;
  timeZone: string;
  canManage: boolean;
  basket: BasketApi;
  isPhone: boolean;
  /** In its own window: nothing opens beside it. */
  alone: boolean;
  /** The item it opens at (?item=, a chip on its room's row). */
  focusItem: string | undefined;
}

/** Who added a wall on the spot, as the job's people list names them. */
function useAdder(projectId: string, area: RevArea, enabled: boolean): string {
  const people = usePeopleDisplay(enabled ? projectId : null);
  return people.data?.find((p) => p.user_id === area.field_by)?.full_name ?? 'a member';
}

function WallBody({ projectId, area, setup, index, timeZone, canManage, basket, isPhone, alone, focusItem }: BodyProps) {
  const nav = useRevsNav(projectId, canManage);
  const toast = useToast();
  const rooms = useRevRooms(projectId);
  // Beside the page on a desktop; on a phone (or alone in a window) the request is its own screen, a file the viewer.
  const beside = !isPhone && !alone;
  const [frame, width] = useWidth(isPhone ? 390 : 800);
  const [stage, showWall] = useShowWall();
  const history = useWallHistory(projectId, area.id);
  const confirm = useConfirmFieldWall();
  const checking = canManage && needsCheck(area);
  const adder = useAdder(projectId, area, checking);
  // A manager also sees what is switched off here (last, dashed), to switch it back. Nobody else sees it.
  const revs = useMemo(() => wallRevs(setup, index, area, canManage), [setup, index, area, canManage]);
  const items = useMemo(() => wallItems(revs), [revs]);
  const states = useMemo(() => partStates(items), [items]);
  const [pick, setPick] = useState<WallPick>(() => pickAt(items, focusItem) ?? firstPick(items));
  // Another item's chip tapped while this wall is open: that item is shown.
  const [opened, setOpened] = useState(focusItem);
  if (focusItem !== opened) {
    setOpened(focusItem);
    const at = pickAt(items, focusItem);
    if (at) setPick(at);
  }
  const [signing, setSigning] = useState<SignTarget | null>(null);
  const before = useSignoffActions(projectId, area.id);
  const shown = items.find((i) => i.item.id === pick.focus) ?? null;
  const count = countOf(items.map((i) => i.cell.status));
  // The drawing's height: at most its shape allows at the column's width, and short enough that the top line, the
  // drawing, its facts and the first row of items share the first screen.
  const wide = !isPhone && width >= 1000;
  const wallHeight = isPhone ? '44dvh' : `max(240px, min(${wide ? '55dvh' : '50dvh'}, 100dvh - 340px))`;
  const openFile = useOpenRevFile(projectId, beside ? (fileId) => { nav.openBeside(area.id, { fileId }); } : undefined);
  // The decided request opens only for those who may read it (rev_wall_history's can_open).
  const canOpen = (requestId: string) => history.data?.some((r) => r.request_id === requestId && r.can_open) ?? false;
  const manage = useWallManage({ projectId, area, setup, isPhone, onRemoved: () => { nav.close(area.level.trim()); } });
  const onTap = (item: WallItem) => {
    setPick({ focus: item.item.id, part: item.part });
    showWall();
  };
  // Where it is in its room (not again when it was opened from the room: Back goes there), and on the plan.
  const where: ReactNode = (
    <div className={`flex gap-3 ${isPhone ? 'flex-col' : 'flex-wrap items-start'}`}>
      {rooms.data && nav.fromRoom === undefined ? (
        <WallRoomPick
          projectId={projectId}
          area={area}
          setup={setup}
          index={index}
          rooms={rooms.data}
          isPhone={isPhone}
          onOpenRoom={nav.openRoom}
          onOpenWall={nav.openFromRoom}
        />
      ) : null}
      <WallThumb
        projectId={projectId}
        area={area}
        canManage={canManage}
        isPhone={isPhone}
        onShow={() => { nav.showPlan({ level: area.level.trim(), wall: area.id }); }}
        onPlace={() => { nav.showPlan({ level: area.level.trim(), place: area.id }); }}
      />
    </div>
  );
  const wallBasket = basket.can ? { has: (itemId: string) => basket.has(area.id, itemId), toggle: (itemId: string) => { basket.toggle(area.id, itemId); }, busy: basket.busy } : null;

  return (
    <div ref={frame} className="flex flex-col gap-3" data-testid="rev-wall-page" data-wide={wide ? 'true' : undefined}>
      <WallTopLine area={area} count={count} manage={canManage ? manage.buttons : null} />
      {checking ? (
        <FieldCheck
          by={adder}
          busy={confirm.isPending || manage.busy}
          onConfirm={() => {
            confirm.mutate({ projectId, areaId: area.id }, { onError: (e) => { toast.show({ tone: 'error', message: messageOf(e) }); } });
          }}
          onEdit={manage.edit}
          onRemove={manage.remove}
        />
      ) : null}
      {manage.form}
      <div ref={stage} className="flex flex-col gap-1" data-testid="rev-wall-stage">
        <Wall3D
          states={states}
          focus={pick.part ?? undefined}
          focusLabel={shown?.item.name}
          onPick={(part) => { setPick(tapPart(pick, part, items)); }}
          maxHeight={wallHeight}
          testId="rev-wall-3d"
        />
        <WallFacts
          projectId={projectId}
          area={area}
          shown={shown}
          timeZone={timeZone}
          canManage={canManage}
          onOpenRequest={nav.openRequest}
          canOpen={canOpen}
          onSignBefore={(i) => { setSigning({ itemIds: [i.item.id], label: i.item.name }); }}
          onClearBefore={(i) => { before.clear({ itemIds: [i.item.id], label: i.item.name }); }}
        />
      </div>
      {signing ? (
        <SignoffForm key={signing.itemIds.join(',')} target={signing} onSave={(v) => before.set(signing, v)} onCancel={() => { setSigning(null); }} />
      ) : null}
      {/* An item scrolled to lands clear of the request's bar at the bottom. */}
      <div className="mt-1 [&_button]:scroll-mb-28">
        <WallItems
          revs={revs}
          items={items}
          pick={pick}
          onTap={onTap}
          basket={wallBasket}
          onSignRev={canManage ? (rev, itemIds) => { setSigning({ itemIds, label: `Rev ${String(rev.number)} · ${rev.name}` }); } : undefined}
        />
      </div>
      <WallInfo
        projectId={projectId}
        area={area}
        list={setup.lists.find((l) => l.id === area.list_id)}
        side={where}
        onShowSheet={() => { nav.showPlan({ level: area.level.trim(), wall: area.geom ? area.id : undefined }); }}
      />
      <WallPhotos projectId={projectId} areaId={area.id} isPhone={isPhone} />
      <WallHistory
        projectId={projectId}
        areaId={area.id}
        items={items}
        onRequest={(requestId) => {
          if (beside) nav.openBeside(area.id, { requestId });
          else nav.openRequest(requestId);
        }}
        onFile={(row) => {
          openFile(row.file_id);
        }}
      />
    </div>
  );
}

/** Back to Revs, or to the room the wall was opened from (by its name). */
function BackToRevs({ projectId, canManage, level }: { projectId: string; canManage: boolean; level: string | undefined }) {
  const nav = useRevsNav(projectId, canManage);
  const rooms = useRevRooms(projectId);
  const from = nav.fromRoom === undefined ? undefined : rooms.data?.rooms.find((r) => r.id === nav.fromRoom);
  return (
    <button
      type="button"
      className="-ml-1 flex min-h-8 items-center gap-0.5 self-start break-words text-left text-sm font-medium text-accent"
      data-testid="rev-wall-back"
      onClick={() => {
        if (from) nav.openRoom(from.id);
        else nav.close(level);
      }}
    >
      <Icon icon={ChevronLeft} size={16} />
      {from ? roomLabel(from) : 'Inspection cards'}
    </button>
  );
}

export function WallPage({ projectId, areaId, isPhone }: WallPageProps) {
  const own: { window?: string | undefined; room?: string | undefined; item?: string | undefined } = useSearch({ strict: false });
  const setup = useRevSetup(projectId);
  const status = useRevStatus(projectId);
  const manage = useCapability(projectId, 'revs.manage');
  const basket = useBasket(projectId);
  const nav = useRevsNav(projectId, manage.data === true);
  const jobs = useMyProjects();
  const index = useMemo(() => indexStatus(status.data ?? []), [status.data]);
  const zone = jobs.data?.find((p) => p.project_id === projectId)?.timezone;

  let body: ReactNode;
  const failed = [setup, status, manage, jobs].find((q) => q.isError);
  const area = setup.data?.areas.find((a) => a.id === areaId);
  if (failed) body = <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;
  else if (!setup.data || !status.data || manage.isPending || zone === undefined) body = <LoadingState label="Loading the wall" />;
  else if (!area) body = <EmptyState title="This wall is no longer on the job." />;
  else {
    body = (
      <WallBody
        key={area.id}
        projectId={projectId}
        area={area}
        setup={setup.data}
        index={index}
        timeZone={zone}
        canManage={manage.data === true}
        basket={basket}
        isPhone={isPhone}
        alone={own.window === '1'}
        focusItem={own.item}
      />
    );
  }
  const bar = own.window === '1' ? null : <BasketBar basket={basket} onReview={nav.review} isPhone={isPhone} />;
  // A phone's screen has its own Back (to Revs); opened from a room, the way back to the room is at the top.
  if (isPhone) {
    return (
      <div className="flex min-h-full flex-col gap-1 px-4 pt-3">
        {own.window !== '1' && own.room !== undefined ? <BackToRevs projectId={projectId} canManage={manage.data === true} level={area?.level.trim()} /> : null}
        <div className="flex-1">{body}</div>
        {bar}
      </div>
    );
  }
  return (
    <div className="flex min-h-full flex-col gap-2">
      {own.window === '1' ? null : <BackToRevs projectId={projectId} canManage={manage.data === true} level={area?.level.trim()} />}
      <Card>{body}</Card>
      {bar}
    </div>
  );
}
