// Walls: every wall as a callout tile, by level (and by list when a job has more than one): its tag (F6a) small, the
// wall's name big (it wraps, never cut), its grid or room small, and a slim bar of what passed, is requested or
// failed. A tap opens the wall's own page.
import type { ReactNode } from 'react';
import { Settings2 } from 'lucide-react';
import type { RevArea, RevSetup } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { wallRevs, wallsByList, type StatusIndex } from './model';
import { calloutOf, countLine, countOf } from './wallPage';
import { WallProgress } from './WallProgress';

interface WallsViewProps {
  setup: RevSetup;
  index: StatusIndex;
  onOpen: (id: string) => void;
  /** Managers: the empty screen points to Setup. */
  onSetup?: (() => void) | undefined;
}

interface WallTileProps {
  area: RevArea;
  setup: RevSetup;
  index: StatusIndex;
  onOpen: (id: string) => void;
  /** Under the tile: a manager's moves on it in a room (0083). */
  footer?: ReactNode;
}

export function WallTile({ area, setup, index, onOpen, footer }: WallTileProps) {
  const count = countOf(wallRevs(setup, index, area).flatMap((r) => r.cells.map((c) => c.cell.status)));
  const { title, sub } = calloutOf(area.name);
  const done = count.needed > 0 && count.passed === count.needed;
  return (
    <li className="flex flex-col gap-1">
      <button
        type="button"
        data-testid={`rev-wall-${area.id}`}
        data-failed={count.failed > 0 ? 'true' : undefined}
        className="flex h-full w-full flex-col gap-2.5 rounded-card bg-card px-4 pb-3.5 pt-3 text-left shadow-card transition-shadow hover:shadow-pop focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onClick={() => {
          onOpen(area.id);
        }}
      >
        <span className="flex flex-col gap-0.5">
          {area.wall_tag ? (
            <span className="text-[12.5px] font-semibold leading-4 text-ink-3" data-testid="rev-wall-tag">
              {area.wall_tag}
            </span>
          ) : null}
          <span className="break-words text-[17px] font-semibold leading-6 tracking-[-0.01em] text-ink">{title}</span>
          {sub ? <span className="break-words text-[13px] font-medium text-ink-2">{sub}</span> : null}
        </span>
        <span className="mt-auto flex flex-col gap-1">
          <WallProgress count={count} />
          <span className={`text-[12.5px] font-medium tabular-nums ${done ? 'text-[color:var(--status-approved-fg)]' : 'text-ink-3'}`}>
            {countLine(count)}
            {count.failed > 0 ? <span className="text-danger">{` · ${String(count.failed)} failed`}</span> : null}
          </span>
        </span>
      </button>
      {footer}
    </li>
  );
}

/** "Level 01 · 6 walls": a level's heading. */
export function LevelHead({ title, count }: { title: string; count: string }) {
  return (
    <h2 className="flex items-baseline gap-2 px-1 text-[12px] font-semibold uppercase leading-5 tracking-[0.06em] text-ink-2">
      <span className="break-words">{title}</span>
      <span className="font-medium normal-case tracking-normal text-ink-3">{count}</span>
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

export function WallsView({ setup, index, onOpen, onSetup }: WallsViewProps) {
  const groups = wallsByList(setup);
  if (groups.length === 0) return <NoWalls onSetup={onSetup} />;
  const manyLists = setup.lists.length > 1;
  return (
    <div className="flex flex-col gap-5" data-testid="rev-walls">
      {groups.map(({ list, levels }) => (
        <section key={list.id} className="flex flex-col gap-4">
          {manyLists ? (
            <p className="break-words px-1 text-[15px] font-semibold text-ink">
              {list.name}
              {list.phase ? <span className="ml-2 text-[13px] font-medium text-ink-3">{list.phase}</span> : null}
            </p>
          ) : null}
          {levels.map((g) => (
            <section key={g.level} className="flex flex-col gap-2" data-testid="rev-level">
              <LevelHead title={g.level} count={countOfThings(g.areas.length, 'wall', 'walls')} />
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.areas.map((a) => (
                  <WallTile key={a.id} area={a} setup={setup} index={index} onOpen={onOpen} />
                ))}
              </ul>
            </section>
          ))}
        </section>
      ))}
    </div>
  );
}
