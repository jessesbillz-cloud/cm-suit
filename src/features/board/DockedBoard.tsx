// The board as a docked right-column panel while another tool fills the main area: the board's own lines, compact.
import { useBoardFeed } from '../../data/queries';
import type { BoardLine } from '../../data/types';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { BoardLineRow } from './BoardLineRow';
import { useProjectZones } from './zones';

const DOCKED_LINES = 20;

interface DockedBoardProps {
  projectId: string | null;
  onOpen: (line: BoardLine) => void;
}

export function DockedBoard({ projectId, onOpen }: DockedBoardProps) {
  const feed = useBoardFeed(projectId);
  const zoneOf = useProjectZones();
  if (feed.isPending) return <LoadingState label="Loading the board" />;
  if (feed.isError) return <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />;
  const lines = feed.data.pages.flat().slice(0, DOCKED_LINES);
  if (lines.length === 0) return <EmptyState icon={TOOL_META.board.icon} title="No activity yet." />;
  return (
    <ul className="divide-y divide-line">
      {lines.map((l) => (
        <BoardLineRow
          key={l.id}
          line={l}
          showJob={projectId === null}
          zone={zoneOf(l.project_id)}
          selected={false}
          compact
          onOpen={onOpen}
        />
      ))}
    </ul>
  );
}
