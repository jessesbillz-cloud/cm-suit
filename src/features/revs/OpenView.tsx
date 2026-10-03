// Open: the end-of-job check (Jesse, Oct 2: today someone reconciles at the end). Per rev, per item, how many walls
// are still open and which, by level; a wall waiting on a result has a gold dot, a failed one is red. A tap opens the
// wall. When nothing is open, it says so.
import type { RevSetup } from '../../data/revs.types';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { openRollup, type OpenWall, type StatusIndex } from './model';

interface OpenViewProps {
  setup: RevSetup;
  index: StatusIndex;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

/** The walls of one item, by level, in their order. */
function byLevel(walls: readonly OpenWall[]): { level: string; walls: OpenWall[] }[] {
  const out: { level: string; walls: OpenWall[] }[] = [];
  for (const w of walls) {
    const level = w.area.level.trim();
    const g = out.find((x) => x.level.toLowerCase() === level.toLowerCase());
    if (g) g.walls.push(w);
    else out.push({ level, walls: [w] });
  }
  return out.sort((a, b) => a.level.localeCompare(b.level, undefined, { numeric: true, sensitivity: 'base' }));
}

interface WallLinkProps {
  wall: OpenWall;
  selected: boolean;
  onOpen: (id: string) => void;
}

function WallLink({ wall, selected, onOpen }: WallLinkProps) {
  const failed = wall.status === 'failed';
  return (
    <button
      type="button"
      data-testid="rev-open-wall"
      data-status={wall.status}
      aria-current={selected ? 'true' : undefined}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2 py-0.5 text-left text-[13px] leading-5 ${
        selected ? 'border-accent bg-accent-soft' : 'border-line bg-card hover:border-ink-3/50 hover:bg-page'
      } ${failed ? 'text-danger' : 'text-ink'}`}
      onClick={() => {
        onOpen(wall.area.id);
      }}
    >
      {wall.status === 'requested' ? (
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--status-pending-dot)' }} />
      ) : null}
      <span className="break-words">{wall.area.name}</span>
      {wall.status === 'open' ? null : <span className="sr-only">{`, ${wall.status}`}</span>}
    </button>
  );
}

export function OpenView({ setup, index, selectedId, onOpen }: OpenViewProps) {
  if (setup.areas.length === 0) {
    return (
      <Card>
        <EmptyState icon={TOOL_META.revs.icon} title="No walls yet." />
      </Card>
    );
  }
  const revs = openRollup(setup, index);
  if (revs.length === 0) {
    return (
      <Card>
        <EmptyState icon={TOOL_META.revs.icon} title="Nothing left open." />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-testid="rev-open">
      {revs.map(({ rev, items }) => (
        <Card key={rev.id} padded={false} className="overflow-hidden" title={`Rev ${String(rev.number)} · ${rev.name}`}>
          <ul className="divide-y divide-line">
            {items.map(({ item, walls }) => (
              <li key={item.id} className="flex flex-col gap-1.5 px-4 py-2.5" data-testid={`rev-open-item-${item.id}`} data-count={walls.length}>
                <p className="flex items-baseline gap-3 text-[14.5px] leading-6">
                  <span className="min-w-0 flex-1 break-words font-medium text-ink">{item.name}</span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink-2">{walls.length} open</span>
                </p>
                {byLevel(walls).map((g) => (
                  <div key={g.level} className="flex items-start gap-2">
                    <span className="w-16 shrink-0 break-words pt-1 text-[12px] font-medium leading-5 text-ink-3">{g.level}</span>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                      {g.walls.map((w) => (
                        <WallLink key={w.area.id} wall={w} selected={selectedId === w.area.id} onOpen={onOpen} />
                      ))}
                    </div>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
