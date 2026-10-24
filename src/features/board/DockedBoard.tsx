// The board as a docked right-column panel while another tool fills the main area: the board's own lines, compact.
import { useBoardFeed } from '../../data/queries';
import type { BoardLine } from '../../data/types';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { BoardLines } from './BoardLines';

const DOCKED_LINES = 20;

interface DockedBoardProps {
  projectId: string | null;
  onOpen: (line: BoardLine) => void;
}

export function DockedBoard({ projectId, onOpen }: DockedBoardProps) {
  const feed = useBoardFeed(projectId);
  if (feed.isPending) return <LoadingState label="Loading the board" />;
  if (feed.isError) return <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />;
  const lines = feed.data.pages.flat().slice(0, DOCKED_LINES);
  if (lines.length === 0) return <EmptyState icon={TOOL_META.board.icon} title="No activity yet." />;
  return <BoardLines projectId={projectId} lines={lines} selectedId={null} compact onOpen={onOpen} />;
}
