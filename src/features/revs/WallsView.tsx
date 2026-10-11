// Walls: every wall of the level picked (all of them under All) as a callout tile, by level under All and by list when
// a job has more than one: its tag (F6a) small, the wall's name big (it wraps, never cut), its grid or room small, and
// its items by rev (WallItemChips). A tap on the tile opens the wall's own page; a passed item with its OFS IR on file
// opens that, any other item the wall at that item.
import { Settings2 } from 'lucide-react';
import type { RevArea, RevSetup } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { onLevel } from './levels';
import { wallRevs, wallsByList, type StatusIndex } from './model';
import { itemLines, type ItemChip } from './itemLines';
import type { SignoffFiles } from './revStrip';
import { WallItemChips } from './WallItemChips';
import { calloutOf, countOf } from './wallPage';

interface WallsViewProps {
  setup: RevSetup;
  index: StatusIndex;
  files: SignoffFiles;
  /** The level picked; null = All. */
  level: string | null;
  onOpen: (id: string) => void;
  onChip: (areaId: string, chip: ItemChip) => void;
  /** Managers: the empty screen points to Setup. */
  onSetup?: (() => void) | undefined;
}

interface WallTileProps {
  area: RevArea;
  setup: RevSetup;
  index: StatusIndex;
  files: SignoffFiles;
  onOpen: (id: string) => void;
  onChip: (areaId: string, chip: ItemChip) => void;
}

/** A card the whole of which opens the wall (its name button stretched over it), its item chips on top. */
export function WallTile({ area, setup, index, files, onOpen, onChip }: WallTileProps) {
  const count = countOf(wallRevs(setup, index, area).flatMap((r) => r.cells.map((c) => c.cell.status)));
  const { title, sub } = calloutOf(area.name, area.wall_tag);
  return (
    <li
      className="relative flex flex-col gap-2.5 rounded-card bg-card px-4 pb-3.5 pt-3 shadow-card transition-shadow hover:shadow-pop"
      data-testid={`rev-wall-${area.id}`}
      data-failed={count.failed > 0 ? 'true' : undefined}
    >
      <button
        type="button"
        className="flex flex-col gap-0.5 text-left after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
        data-testid="rev-wall-open"
        onClick={() => {
          onOpen(area.id);
        }}
      >
        {area.wall_tag ? (
          <span className="text-[12.5px] font-semibold leading-4 text-ink-3" data-testid="rev-wall-tag">
            {area.wall_tag}
          </span>
        ) : null}
        <span className="break-words text-[17px] font-semibold leading-6 tracking-[-0.01em] text-ink">{title}</span>
        {sub ? <span className="break-words text-[13px] font-medium text-ink-2">{sub}</span> : null}
      </button>
      <WallItemChips
        className="mt-auto"
        lines={itemLines(setup, index, area, files)}
        onChip={(chip) => {
          onChip(area.id, chip);
        }}
      />
    </li>
  );
}

/** "Level 01 · 6 walls": a level's heading. */
export function LevelHead({ title, count }: { title: string; count: string }) {
  return (
    <h2 className="flex items-baseline gap-2 px-1 text-[12px] font-bold uppercase leading-5 tracking-[0.06em] text-ink">
      <span className="break-words">{title}</span>
      <span className="font-bold normal-case tracking-normal text-ink">{count}</span>
    </h2>
  );
}

/** "6 walls", "1 room". */
export function countOfThings(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/** Managers: the empty screen points to Setup. */
export function NoWalls({ onSetup }: { onSetup?: (() => void) | undefined }) {
  return (
    <Card>
      <EmptyState
        icon={TOOL_META.revs.icon}
        title="No walls yet."
        action={
          onSetup ? (
            <Button variant="primary" icon={Settings2} data-testid="rev-go-setup" onClick={onSetup}>
              Open Setup
            </Button>
          ) : undefined
        }
      />
    </Card>
  );
}

/** A list's name over its walls, when the job has more than one. */
export function ListHead({ name, phase }: { name: string; phase: string | null }) {
  return (
    <p className="break-words px-1 text-[15px] font-semibold text-ink">
      {name}
      {phase ? <span className="ml-2 text-[13px] font-medium text-ink-3">{phase}</span> : null}
    </p>
  );
}

/** Walls on the job, none on this level. */
export function NothingHere() {
  return (
    <Card>
      <EmptyState icon={TOOL_META.revs.icon} title="Nothing on this level." />
    </Card>
  );
}

export const TILE_GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3';

export function WallsView({ setup, index, files, level, onOpen, onChip, onSetup }: WallsViewProps) {
  const groups = wallsByList({ ...setup, areas: onLevel(setup.areas, level) });
  if (groups.length === 0) return setup.areas.length === 0 ? <NoWalls onSetup={onSetup} /> : <NothingHere />;
  const manyLists = setup.lists.length > 1;
  return (
    <div className="flex flex-col gap-5" data-testid="rev-walls">
      {groups.map(({ list, levels }) => (
        <section key={list.id} className="flex flex-col gap-4">
          {manyLists ? <ListHead name={list.name} phase={list.phase} /> : null}
          {levels.map((g) => (
            <section key={g.level} className="flex flex-col gap-2" data-testid="rev-level">
              {level === null ? <LevelHead title={g.level} count={countOfThings(g.areas.length, 'wall', 'walls')} /> : null}
              <ul className={TILE_GRID}>
                {g.areas.map((a) => (
                  <WallTile key={a.id} area={a} setup={setup} index={index} files={files} onOpen={onOpen} onChip={onChip} />
                ))}
              </ul>
            </section>
          ))}
        </section>
      ))}
    </div>
  );
}
