// The board's lines under their day headings (Today, Yesterday, then the date), each line colored by what happened
// (BoardLineRow, lineTone). The same on the board and docked in the right column. The lines' requests and their
// writers' names come from data/board.queries; until they land a line shows its kind's own look.
import type { BoardLine } from '../../data/types';
import { useBoardFacts } from '../../data/board.queries';
import { ErrorState } from '../../ui/States';
import { groupByDay } from './boardDays';
import { BoardLineRow } from './BoardLineRow';
import { lineLook } from './lineTone';
import { useProjectZones } from './zones';

interface BoardLinesProps {
  /** null = all my jobs (each line names its job). */
  projectId: string | null;
  lines: readonly BoardLine[];
  selectedId: string | null;
  compact: boolean;
  onOpen: (line: BoardLine) => void;
}

export function BoardLines({ projectId, lines, selectedId, compact, onOpen }: BoardLinesProps) {
  const zoneOf = useProjectZones();
  const facts = useBoardFacts(projectId, lines);
  const days = groupByDay(lines, zoneOf);
  return (
    <>
      {facts.error ? <ErrorState error={facts.error} onRetry={facts.retry} title="Some line details did not load." /> : null}
      <div className="divide-y divide-line-strong">
        {days.map((d) => (
          <section key={d.day} data-testid="board-day" data-day={d.day} aria-label={d.heading}>
            <h3
              data-testid="board-day-heading"
              className="heading border-b border-line bg-card-head px-4 py-1.5 text-[13px] font-semibold leading-5 text-ink"
            >
              {d.heading}
            </h3>
            <ul className="divide-y divide-line">
              {d.lines.map((l) => {
                const req = l.entity_type === 'inspection_request' ? (facts.requests.get(l.entity_id) ?? null) : null;
                return (
                  <BoardLineRow
                    key={l.id}
                    line={l}
                    look={lineLook(l.kind, req)}
                    fromMdr={req?.fromMdr === true}
                    who={facts.names.get(l.actor_user_id) ?? null}
                    showJob={projectId === null}
                    zone={zoneOf(l.project_id)}
                    selected={l.id === selectedId}
                    compact={compact}
                    testId="board-line"
                    onOpen={onOpen}
                  />
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
