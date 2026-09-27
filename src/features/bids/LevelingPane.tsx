// A bid opened from the leveling grid: the submission pane (file, findings, money) with the leveling actions on top.
import { useBidPackages } from '../../data/bids.queries';
import { useLevelingBoard } from '../../data/leveling.queries';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { LevelingActions } from './LevelingActions';
import { SubmissionPane } from './SubmissionPane';

interface LevelingPaneProps {
  projectId: string;
  submissionId: string;
}

export function LevelingPane({ projectId, submissionId }: LevelingPaneProps) {
  const board = useLevelingBoard(projectId, true);
  const packages = useBidPackages(projectId);

  if (board.isPending || packages.isPending) return <LoadingState label="Loading bid" />;
  if (board.isError) return <ErrorState error={board.error} onRetry={() => void board.refetch()} />;
  if (packages.isError) return <ErrorState error={packages.error} onRetry={() => void packages.refetch()} />;
  const row = board.data.find((r) => r.submission_id === submissionId);
  if (!row) return <EmptyState title="That bid is not here." />;
  return (
    <SubmissionPane
      projectId={projectId}
      submissionId={submissionId}
      bidder={row.bidder}
      actions={<LevelingActions key={row.submission_id} projectId={projectId} row={row} packages={packages.data} />}
    />
  );
}
