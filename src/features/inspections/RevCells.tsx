// An OFS request's walls and items: one card per item (its map color, its name), its walls with Passed / Failed and why
// it failed. The deputy's own result step (RevResults) uses the same cards with Pass / Fail on each wall.
import type { ReactNode } from 'react';
import type { IrRevItem, RevSetup } from '../../data/revs.types';
import { useRevSetup } from '../../data/revs.queries';
import { ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { Swatch } from '../revs/map/MarkupBar';
import { cellChip, cellGroups, oneLevel, type CellGroup } from './revCells';

/** One item's card: its color and name over its walls. */
export function CellGroupCard({ group, children }: { group: CellGroup; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-card" aria-label={group.item}>
      <h4 className="flex items-center gap-2.5 border-b border-line bg-card-head px-3 py-2 text-sm font-semibold text-ink">
        <Swatch color={group.color} />
        <span className="break-words">{group.item}</span>
      </h4>
      <ul className="divide-y divide-line">{children}</ul>
    </section>
  );
}

/** The job's setup (wall and item names) for a request's cells. */
export function WithSetup({ projectId, children }: { projectId: string; children: (setup: RevSetup) => ReactNode }) {
  const setup = useRevSetup(projectId);
  if (setup.isError) return <ErrorState error={setup.error} onRetry={() => void setup.refetch()} className="m-0" />;
  if (setup.isPending) return <LoadingState label="Loading the walls" />;
  return <>{children(setup.data)}</>;
}

/** The request's level, when its walls are all on one (each wall names its level otherwise). */
export function LevelLine({ cells, setup }: { cells: readonly IrRevItem[]; setup: RevSetup }) {
  const level = oneLevel(cells, setup);
  return level === null ? null : <p className="text-[13px] font-semibold text-ink">{level}</p>;
}

function CellList({ cells, setup }: { cells: readonly IrRevItem[]; setup: RevSetup }) {
  return (
    <div className="flex flex-col gap-2" data-testid="rev-cells">
      <LevelLine cells={cells} setup={setup} />
      {cellGroups(cells, setup).map((g) => (
        <CellGroupCard key={g.color} group={g}>
          {g.rows.map(({ cell, label }) => {
            const chip = cellChip(cell.result);
            return (
              <li key={cell.id} className="flex flex-col gap-1 px-3 py-2.5" data-testid={`rev-cell-${cell.area_id}-${cell.item_id}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="break-words text-sm text-ink">{label}</span>
                  {chip ? <StatusChip status={chip.status} label={chip.label} /> : null}
                </div>
                {cell.result === 'failed' && cell.result_note ? <p className="whitespace-pre-wrap break-words text-sm text-ink-2">{cell.result_note}</p> : null}
              </li>
            );
          })}
        </CellGroupCard>
      ))}
    </div>
  );
}

export function RevCells({ projectId, cells }: { projectId: string; cells: readonly IrRevItem[] }) {
  return <WithSetup projectId={projectId}>{(setup) => <CellList cells={cells} setup={setup} />}</WithSetup>;
}
