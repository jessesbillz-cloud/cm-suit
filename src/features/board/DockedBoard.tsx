// The board as a docked right-column panel while another tool fills the main area.
import { useBoardFeed } from '../../data/queries';
import type { BoardLine } from '../../data/types';
import { formatInZone } from '../../lib/dates';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
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
  if (lines.length === 0) return <EmptyState title="No activity yet." />;
  return (
    <ul className="divide-y divide-line">
      {lines.map((l) => (
        <li key={l.id}>
          <button
            type="button"
            className={`w-full px-4 py-2.5 text-left text-sm hover:bg-page ${l.unread ? 'font-semibold' : ''}`}
            onClick={() => {
              onOpen(l);
            }}
          >
            <span className="block break-words text-ink">{l.summary}</span>
            <span className="block text-xs font-normal text-ink-2">
              {formatInZone(l.created_at, zoneOf(l.project_id), 'MMM d, h:mm a')}
              {projectId === null ? ` · ${l.project_name}` : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
