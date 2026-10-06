// One wall's own inspection page (Jesse, Oct 3: "the whole wall gets built out on its own inspection page ... a 3-D
// version of it sitting there ... Oh, first layer of drywall, there it is"): its callout, the 3-D wall with each part
// tinted by its state, and every item of its list as a button. A tap on an item shows it on the wall with a leader
// and its facts under the drawing; a tap on the wall shows that part's item. Up to three items still to ask for are
// picked for Request (Inspections > new, prefilled). On a desktop it fills the main area (the drawing beside the
// items when there is room); on a phone it is its own screen with the drawing held at the top while the items scroll.
// A manager renames or removes the wall here (Undo), and signs items or a whole rev off before the app (0082: the
// form opens over the items). At the top, the wall highlighted on its room's image (0083, the little picker: a tap
// opens it full screen) beside where it is on the plan; at the bottom its history, every inspection per item (a tap
// opens the request or the OFS IR beside the page on a desktop). Opened from a room, Back goes to the room. In its own
// window (?window=1) there is no "Revs" to go back to.
import { useMemo, useState, type ReactNode } from 'react';
import { useSearch } from '@tanstack/react-router';
import { ChevronLeft, Plus } from 'lucide-react';
import { useCapability, useMyProjects } from '../../data/queries';
import { useRevFileFetch } from '../../data/revs.history';
import { useRevSetup, useRevStatus } from '../../data/revs.queries';
import { useRevRooms } from '../../data/revs.rooms';
import type { RevArea, RevSetup } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { useFileViewer } from '../../ui/FileViewer';
import { Icon } from '../../ui/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { indexStatus, wallRevs, type StatusIndex } from './model';
import { WallThumb } from './plan/WallThumb';
import { revFileItem } from './room/revFileItem';
import { WallRoomPick } from './room/WallRoomPick';
import { roomLabel } from './rooms';
import { useRevsNav } from './useRevsNav';
import { Wall3D } from './wall3d/Wall3D';
import { useWidth } from './wall3d/useWidth';
import { WallFacts } from './WallFacts';
import { WallHeader } from './WallHeader';
import { WallHistory } from './WallHistory';
import { WallItems } from './WallItems';
import { SignoffForm, useSignoffActions, type SignTarget } from './WallBefore';
import { useWallManage } from './WallManage';
import { countOf, firstPick, keepAskable, MAX_PICK, partStates, tapItem, tapPart, wallItems, type WallItem, type WallPick } from './wallPage';
import type { WallPart } from './wallParts';

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
  canRequest: boolean;
  isPhone: boolean;
  /** In its own window: nothing opens beside it. */
  alone: boolean;
}

function RequestButton({ picked, onRequest, wide }: { picked: number; onRequest: () => void; wide: boolean }) {
  return (
    <Button
      variant="primary"
      icon={Plus}
      size={wide ? 'lg' : 'md'}
      className={wide ? 'w-full' : 'shrink-0'}
      disabled={picked === 0}
      data-testid="rev-request"
      data-count={picked}
      onClick={onRequest}
    >
      {picked > 0 ? `Request ${String(picked)} of ${String(MAX_PICK)}` : 'Request'}
    </Button>
  );
}

function WallBody({ projectId, area, setup, index, timeZone, canManage, canRequest, isPhone, alone }: BodyProps) {
  const nav = useRevsNav(projectId, canManage);
  const toast = useToast();
  const rooms = useRevRooms(projectId);
  const viewer = useFileViewer();
  const fetchFile = useRevFileFetch();
  // Beside the page on a desktop; on a phone (or alone in a window) the request is its own screen, a file the viewer.
  const beside = !isPhone && !alone;
  const [frame, width] = useWidth(isPhone ? 390 : 800);
  const revs = useMemo(() => wallRevs(setup, index, area), [setup, index, area]);
  const items = useMemo(() => wallItems(revs), [revs]);
  const states = useMemo(() => partStates(items), [items]);
  const [chosen, setPick] = useState<WallPick>(() => firstPick(items));
  const [signing, setSigning] = useState<SignTarget | null>(null);
  const before = useSignoffActions(projectId, area.id);
  // A picked item that passed or went N/A meanwhile is no longer picked.
  const pick = keepAskable(chosen, items);
  const shown = items.find((i) => i.item.id === pick.focus) ?? null;
  const count = countOf(items.map((i) => i.cell.status));
  const askable = count.needed > count.passed + count.requested;
  const wide = !isPhone && width >= 720;

  const onTap = (item: WallItem) => {
    if (!canRequest) {
      setPick({ ...pick, focus: item.item.id, part: item.part });
      return;
    }
    const { next, full } = tapItem(pick, item);
    setPick(next);
    if (full) toast.show({ message: `${String(MAX_PICK)} items at most on one request.` });
  };
  const onPart = (part: WallPart) => {
    setPick(tapPart(pick, part, items));
  };
  // In list order (rev, then place): the order the request colors them in.
  const request = () => {
    nav.request([area.id], items.filter((i) => pick.picked.includes(i.item.id)).map((i) => i.item));
  };
  const button = canRequest && askable ? <RequestButton picked={pick.picked.length} onRequest={request} wide={isPhone} /> : null;
  const manage = useWallManage({ projectId, area, setup, isPhone, onRemoved: nav.close });
  // Where it is in its room, and on the plan: a tap opens the room full screen, or the plan there; a manager places or
  // redraws it.
  const roomPick = rooms.data ? (
    <WallRoomPick
      projectId={projectId}
      area={area}
      setup={setup}
      index={index}
      rooms={rooms.data}
      fromRoom={nav.fromRoom}
      isPhone={isPhone}
      onOpenRoom={nav.openRoom}
      onOpenWall={nav.openFromRoom}
    />
  ) : null;
  const sheetThumb = (
    <WallThumb
      projectId={projectId}
      area={area}
      canManage={canManage}
      isPhone={isPhone}
      onShow={() => {
        nav.showPlan({ level: area.level.trim(), wall: area.id });
      }}
      onPlace={() => {
        nav.showPlan({ level: area.level.trim(), place: area.id });
      }}
    />
  );
  const thumb = (
    <div className={`flex gap-3 ${isPhone ? 'flex-col' : 'shrink-0 flex-col items-end'}`}>
      {roomPick}
      {sheetThumb}
    </div>
  );

  return (
    <div ref={frame} className="flex flex-col gap-4" data-testid="rev-wall-page" data-wide={wide ? 'true' : undefined}>
      <WallHeader
        projectId={projectId}
        area={area}
        list={setup.lists.find((l) => l.id === area.list_id)}
        count={count}
        action={isPhone ? null : button}
        side={isPhone ? null : thumb}
        onShowSheet={() => {
          nav.showPlan({ level: area.level.trim(), wall: area.geom ? area.id : undefined });
        }}
        manage={canManage ? manage.buttons : null}
      />
      {manage.form}
      {isPhone ? thumb : null}
      <div className={wide ? 'grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start gap-6' : 'flex flex-col gap-3'}>
        <div className={`flex flex-col gap-1 bg-card ${isPhone ? 'sticky top-0 z-10 -mx-4 border-b border-line px-4 pb-2' : wide ? 'sticky top-0' : ''}`}>
          <Wall3D
            states={states}
            focus={pick.part ?? undefined}
            focusLabel={shown?.item.name}
            onPick={onPart}
            // The drawing, its facts and the top of the items fit on a short window; on a phone the items keep room.
            maxHeight={isPhone ? '36dvh' : 'max(240px, 100dvh - 330px)'}
            testId="rev-wall-3d"
          />
          <WallFacts
            projectId={projectId}
            area={area}
            shown={shown}
            timeZone={timeZone}
            canManage={canManage}
            onOpenRequest={nav.openRequest}
            onSignBefore={(i) => { setSigning({ itemIds: [i.item.id], label: i.item.name }); }}
            onClearBefore={(i) => { before.clear({ itemIds: [i.item.id], label: i.item.name }); }}
          />
        </div>
        {/* On a phone, an item scrolled to (or focused) lands clear of the drawing held at the top and the bar below. */}
        <div className={isPhone ? '[&_button]:scroll-mb-24 [&_button]:scroll-mt-[calc(36dvh+7rem)]' : undefined}>
          {signing ? (
            <SignoffForm
              key={signing.itemIds.join(',')}
              target={signing}
              onSave={(v) => before.set(signing, v)}
              onCancel={() => { setSigning(null); }}
            />
          ) : null}
          <WallItems
            revs={revs}
            items={items}
            pick={pick}
            onTap={onTap}
            onSignRev={canManage ? (rev, itemIds) => { setSigning({ itemIds, label: `Rev ${String(rev.number)} · ${rev.name}` }); } : undefined}
          />
        </div>
      </div>
      <WallHistory
        projectId={projectId}
        areaId={area.id}
        items={items}
        onRequest={(requestId) => {
          if (beside) nav.openBeside(area.id, { requestId });
          else nav.openRequest(requestId);
        }}
        onFile={(row) => {
          if (beside) nav.openBeside(area.id, { fileId: row.file_id });
          else viewer.open([revFileItem(projectId, row.file_id, row.file_name ?? 'OFS IR', fetchFile)]);
        }}
      />
      {isPhone && button ? <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-card px-4 py-3">{button}</div> : null}
    </div>
  );
}

/** Back to Revs, or to the room the wall was opened from (by its name). */
function BackToRevs({ projectId, canManage }: { projectId: string; canManage: boolean }) {
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
        else nav.close();
      }}
    >
      <Icon icon={ChevronLeft} size={16} />
      {from ? roomLabel(from) : 'Revs'}
    </button>
  );
}

export function WallPage({ projectId, areaId, isPhone }: WallPageProps) {
  const own: { window?: string | undefined; room?: string | undefined } = useSearch({ strict: false });
  const setup = useRevSetup(projectId);
  const status = useRevStatus(projectId);
  const manage = useCapability(projectId, 'revs.manage');
  const ask = useCapability(projectId, 'ir.request');
  const jobs = useMyProjects();
  const index = useMemo(() => indexStatus(status.data ?? []), [status.data]);
  const zone = jobs.data?.find((p) => p.project_id === projectId)?.timezone;

  let body: ReactNode;
  const failed = [setup, status, manage, ask, jobs].find((q) => q.isError);
  const area = setup.data?.areas.find((a) => a.id === areaId);
  if (failed) body = <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;
  else if (!setup.data || !status.data || manage.isPending || ask.isPending || zone === undefined) body = <LoadingState label="Loading the wall" />;
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
        canRequest={ask.data === true}
        isPhone={isPhone}
        alone={own.window === '1'}
      />
    );
  }
  // A phone's screen has its own Back (to Revs); opened from a room, the way back to the room is at the top.
  if (isPhone) {
    return (
      <div className="flex flex-col gap-1 px-4 pt-3">
        {own.window !== '1' && own.room !== undefined ? <BackToRevs projectId={projectId} canManage={manage.data === true} /> : null}
        {body}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {own.window === '1' ? null : <BackToRevs projectId={projectId} canManage={manage.data === true} />}
      <Card>{body}</Card>
    </div>
  );
}
