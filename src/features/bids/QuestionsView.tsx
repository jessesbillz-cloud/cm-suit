// Pre-bid questions (SPEC §11.5): number, first line, status, date. A row opens it on the right to answer.
import { useBidQuestions } from '../../data/bids.queries';
import { formatInZone } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { StatusChip } from '../../ui/StatusChip';
import { BidList } from './BidList';
import { firstLine, questionChip } from './model';

interface QuestionsViewProps {
  projectId: string;
  tz: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

export function QuestionsView({ projectId, tz, selectedId, onOpen }: QuestionsViewProps) {
  const questions = useBidQuestions(projectId);

  return (
    <Card padded={false}>
      {questions.isPending ? <LoadingState label="Loading questions" /> : null}
      {questions.isError ? <ErrorState error={questions.error} onRetry={() => void questions.refetch()} /> : null}
      {questions.data?.length === 0 ? <EmptyState title="No questions yet." icon={TOOL_META.bids.icon} /> : null}
      {questions.data && questions.data.length > 0 ? (
        <BidList
          testId="question"
          selectedId={selectedId}
          onOpen={onOpen}
          rows={questions.data.map((q) => {
            const chip = questionChip(q.status);
            return {
              id: q.id,
              lead: String(q.number),
              title: firstLine(q.question),
              chips: <StatusChip status={chip.status} label={chip.label} />,
              meta: formatInZone(q.created_at, tz, 'MMM d'),
            };
          })}
        />
      ) : null}
    </Card>
  );
}
