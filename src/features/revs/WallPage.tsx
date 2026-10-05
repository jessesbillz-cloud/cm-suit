// One wall's own inspection page (Jesse, Oct 3: "the whole wall gets built out on its own inspection page ... a 3-D
// version of it sitting there ... Oh, first layer of drywall, there it is"): its callout, the 3-D wall with each part
// tinted by its state, and every item of its list as a button. A tap on an item shows it on the wall with a leader
// and its facts under the drawing; a tap on the wall shows that part's item. Up to three items still to ask for are
// picked for Request (Inspections > new, prefilled). On a desktop it fills the main area (the drawing beside the
// items when there is room); on a phone it is its own screen with the drawing held at the top while the items scroll.
// A manager renames or removes the wall here (Undo). In its own window (?window=1) there is no "Revs" to go back to.
import { useMemo, useState, type ReactNode } from 'react';
import { useSearch } from '@tanstack/react-router';
import { ChevronLeft, Plus } from 'lucide-react';
import { useCapability, useMyProjects } from '../../data/queries';
import { useRevSetup, useRevStatus } from '../../data/revs.queries';
import type { RevArea, RevSetup } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { indexStatus, wallRevs, type StatusIndex } from './model';
import { WallThumb } from './plan/WallThumb';
import { useRevsNav } from './useRevsNav';
import { Wall3D } from './wall3d/Wall3D';
import { useWidth } from './wall3d/useWidth';
import { WallFacts } from './WallFacts';
import { WallHeader } from './WallHeader';
import { WallItems } from './WallItems';
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

function WallBody({ projectId, area, setup, index, timeZone, canManage, canRequest, isPhone }: BodyProps) {
  const nav = useRevsNav(projectId, canManage);
  const toast = useToast();
  const [frame, width] = useWidth(isPhone ? 390 : 800);
  const revs = useMemo(() => wallRevs(setup, index, area), [setup, index, area]);
  const items = useMemo(() => wallItems(revs), [revs]);
  const states = useMemo(() => partStates(items), [items]);
  const [chosen, setPick] = useState<WallPick>(() => firstPick(items));
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
  // Where it is on the plan: a tap opens the plan there; a manager places or redraws it.
  const thumb = (
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
          <WallFacts projectId={projectId} area={area} shown={shown} timeZone={timeZone} canManage={canManage} onOpenRequest={nav.openRequest} />
        </div>
        {/* On a phone, an item scrolled to (or focused) lands clear of the drawing held at the top and the bar below. */}
        <div className={isPhone ? '[&_button]:scroll-mb-24 [&_button]:scroll-mt-[calc(36dvh+7rem)]' : undefined}>
          <WallItems revs={revs} items={items} pick={pick} onTap={onTap} />
        </div>
      </div>
      {isPhone && button ? <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-card px-4 py-3">{button}</div> : null}
    </div>
  );
}

function BackToRevs({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const nav = useRevsNav(projectId, canManage);
  return (
    <button type="button" className="-ml-1 flex h-8 items-center gap-0.5 self-start text-sm font-medium text-accent" data-testid="rev-wall-back" onClick={nav.close}>
      <Icon icon={ChevronLeft} size={16} />
      Revs
    </button>
  );
}

export function WallPage({ projectId, areaId, isPhone }: WallPageProps) {
  const own: { window?: string | undefined } = useSearch({ strict: false });
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
      />
    );
  }
  if (isPhone) return <div className="px-4 pt-3">{body}</div>;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-2">
      {own.window === '1' ? null : <BackToRevs projectId={projectId} canManage={manage.data === true} />}
      <Card>{body}</Card>
    </div>
  );
}
