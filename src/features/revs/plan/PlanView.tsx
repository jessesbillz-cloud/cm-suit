// Walls on the plan (0059; Jesse, Oct 3: "We have the floor plan layout with all of the walls on it ... this wall here,
// on grid line 7 of the electrical room"): pick the level, see its plan sheet with every wall drawn on it as a thick
// line in its state's color (all passed green, any failed red, any requested gold, else grey) with its callout; a tap
// on a wall opens its page. Pinch or wheel to zoom, drag to pan, as on a map. Managers add walls on the plan (tap the
// start, the end, corners, Done, name it), one after another around the building, and place a wall from its page
// (?place=). A level with no sheet yet: a manager picks one (a plan set's page too). The level, the wall to center on
// and the wall being placed live in the URL (useRevsNav), so a wall opened from here comes back here.
import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { useRevSheets } from '../../../data/revSheets.queries';
import type { RevSetup } from '../../../data/revs.types';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { EmptyState } from '../../../ui/States';
import { TOOL_META } from '../../../ui/tools';
import { wallRevs, type StatusIndex } from '../model';
import { useRevsNav } from '../useRevsNav';
import { calloutOf, countOf } from '../wallPage';
import { DrawBar } from './DrawBar';
import { PlanControls } from './PlanControls';
import { boxOf, cornersOf, isLine, levelNames, levelTargets, sameLevel, targetKey, toneColor, wallAt, wallTone, type Box, type PlanTarget } from './planGeom';
import { PlanSheet } from './PlanSheet';
import { PlanWalls, type PlanWall } from './PlanWalls';
import { usePlanDraw } from './usePlanDraw';

interface PlanViewProps {
  projectId: string;
  setup: RevSetup;
  index: StatusIndex;
  canManage: boolean;
  isPhone: boolean;
}

/** A tap this close to a wall's line (screen pixels) opens it. */
const REACH_PX = 22;

export function PlanView({ projectId, setup, index, canManage, isPhone }: PlanViewProps) {
  const nav = useRevsNav(projectId, canManage);
  const at = nav.planAt;
  const sheets = useRevSheets(projectId);
  const placing = canManage && at.place ? (setup.areas.find((a) => a.id === at.place) ?? null) : null;
  const focusWall = at.wall ? (setup.areas.find((a) => a.id === at.wall) ?? null) : null;

  const known = levelNames(setup.areas);
  const typed = canManage && at.level && !known.some((l) => sameLevel(l, at.level ?? '')) ? [at.level.trim()] : [];
  const levels = [...known, ...typed];
  const firstDrawn = setup.areas.find((a) => a.geom !== null)?.level.trim();
  const level = placing?.level.trim() ?? focusWall?.level.trim() ?? levels.find((l) => sameLevel(l, at.level ?? '')) ?? firstDrawn ?? levels[0] ?? null;
  const levelAreas = level === null ? [] : setup.areas.filter((a) => sameLevel(a.level, level));
  const targets = levelTargets(levelAreas);

  const [chosen, setChosen] = useState<{ level: string; t: PlanTarget } | null>(null);
  const [listPick, setListPick] = useState<string | null>(null);
  const [pages, setPages] = useState<{ fileId: string; n: number } | null>(null);
  const own = (a: typeof placing) => (a?.sheet_file_id ? { fileId: a.sheet_file_id, page: a.sheet_page } : null);
  const target: PlanTarget | null =
    (chosen && level !== null && sameLevel(chosen.level, level) ? chosen.t : null) ?? own(placing) ??
    (focusWall?.geom ? own(focusWall) : null) ?? targets[0] ?? null;
  const pageCount = pages && target && pages.fileId === target.fileId ? pages.n : 1;
  const fileId = target?.fileId ?? null;
  const onPages = useCallback(
    (n: number) => {
      if (fileId !== null) setPages({ fileId, n });
    },
    [fileId],
  );

  const onTarget = target !== null && level !== null;
  const walls: PlanWall[] = !onTarget
    ? []
    : levelAreas
        .filter((a) => a.geom !== null && a.id !== placing?.id && a.sheet_file_id === target.fileId && a.sheet_page === target.page)
        .map((a) => ({
          id: a.id,
          line: a.geom ?? [],
          color: toneColor(wallTone(countOf(wallRevs(setup, index, a).flatMap((r) => r.cells.map((c) => c.cell.status))))),
          title: calloutOf(a.name).title,
        }));
  const listId = listPick ?? levelAreas[0]?.list_id ?? setup.lists[0]?.id ?? null;
  const draw = usePlanDraw({
    projectId,
    level: level ?? '',
    listId,
    target,
    placing,
    corners: cornersOf(walls.map((w) => w.line.map(([x, y]): [number, number] => [x, y]))),
    onPlaced: (row) => {
      nav.showPlan({ level: row.level, wall: row.id }, true);
    },
  });
  const shown = placing ?? focusWall;
  // A phone (a tall frame, a wide sheet) opens the plan as tall as the frame, across the middle of the walls; "Fit"
  // shows the whole sheet. Worked out once per sheet, so walls added meanwhile don't move it.
  const tKey = target ? targetKey(target) : '';
  const [across, setAcross] = useState<{ key: string; x: number } | null>(null);
  if (isPhone && target && across?.key !== tKey) {
    const all = walls.map((w) => w.line);
    const b = all.length > 0 ? boxOf(all) : null;
    setAcross({ key: tKey, x: b ? b.x + b.w / 2 : 0.5 });
  }
  const focus: Box | null =
    shown?.geom && target && shown.sheet_file_id === target.fileId && shown.sheet_page === target.page
      ? boxOf([shown.geom])
      : isPhone && across?.key === tKey
        ? { x: across.x, y: 0, w: 0, h: 1, fill: 1 }
        : null;

  const pickLevel = (l: string) => {
    draw.close();
    nav.showPlan({ level: l }, true);
  };
  const pickTarget = (t: PlanTarget) => {
    if (level !== null) setChosen({ level, t });
  };

  if (setup.lists.length === 0 || (levels.length === 0 && !canManage)) {
    return (
      <Card>
        <EmptyState icon={TOOL_META.revs.icon} title="No walls yet." />
      </Card>
    );
  }
  const names = new Map((sheets.data ?? []).map((s) => [s.id, s.name]));
  const drawing = draw.step !== 'look';
  return (
    <Card padded={false}>
      <div className="flex flex-col gap-3 p-3 sm:p-4" data-testid="rev-plan" data-level={level ?? undefined}>
        {/* Placing a wall: its level is the wall's; only its sheet and page can change. */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <PlanControls
              projectId={projectId}
              levels={placing ? [] : levels}
              level={level}
              onLevel={pickLevel}
              targets={targets}
              target={target}
              onTarget={pickTarget}
              names={names}
              canManage={canManage}
              drawing={draw.step === 'draw'}
              pages={pageCount}
            />
          </div>
          {canManage && !drawing && target && level ? (
            <Button variant="primary" icon={Plus} size={isPhone ? 'lg' : 'md'} className="shrink-0" onClick={draw.start} data-testid="plan-add-wall">
              {isPhone ? 'Wall' : 'Add wall'}
            </Button>
          ) : null}
        </div>
        {draw.step !== 'look' ? (
          <DrawBar
            step={draw.step}
            points={draw.points.length}
            ready={isLine(draw.points)}
            placing={placing ? calloutOf(placing.name).title : null}
            name={draw.name}
            onName={draw.setName}
            lists={setup.lists}
            listId={listId}
            onList={setListPick}
            busy={draw.busy}
            isPhone={isPhone}
            onUndo={draw.undoPoint}
            onDone={draw.done}
            onClose={placing ? () => { nav.open(placing.id); } : draw.close}
            onBack={draw.back}
            onSave={draw.save}
          />
        ) : null}
        {target && level ? (
          <PlanSheet
            projectId={projectId}
            drawing={drawing}
            target={target}
            focus={focus}
            aiming={draw.step === 'draw'}
            onPages={onPages}
            overlay={(place, aspect) => (
              <PlanWalls
                walls={walls}
                place={place}
                aspect={aspect}
                focusId={shown?.id ?? null}
                draft={drawing ? draw.points : null}
                onOpen={drawing ? null : nav.open}
              />
            )}
            onTap={(p, frameAt, place, aspect) => {
              if (draw.step === 'draw') {
                draw.tap(p, place.scale, aspect);
                return;
              }
              if (draw.step !== 'look') return;
              const hit = wallAt(frameAt, walls.map((w) => ({ id: w.id, line: w.line.map((q) => place.toFrame(q)) })), REACH_PX);
              if (hit) nav.open(hit.id);
            }}
          />
        ) : canManage ? null : (
          <EmptyState icon={TOOL_META.revs.icon} title="This level isn't on a plan yet." />
        )}
      </div>
    </Card>
  );
}
