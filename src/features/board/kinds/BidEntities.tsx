// Board lines about bid records: an addendum, a pre-bid question, a published answer. Each shows its text and opens
// in Bids, in the view it lives in.
import { useAddenda, useBidQuestions, usePublishedAnswer } from '../../../data/bids.queries';
import { formatInZone } from '../../../lib/dates';
import { ErrorState, LoadingState } from '../../../ui/States';
import { StatusChip } from '../../../ui/StatusChip';
import { questionChip } from '../../bids/model';
import { EntityPane, Facts, type KindProps } from '../EntityPane';

export function AddendumEntity({ frame, id }: KindProps) {
  const q = useAddenda(frame.projectId);
  if (q.isPending) return <LoadingState label="Loading the addendum" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const a = q.data.find((x) => x.id === id);
  if (!a) return <EntityPane frame={{ ...frame, open: null }} label="Addendum" title="This addendum isn't here." />;
  return (
    <EntityPane frame={frame} label={`Addendum ${String(a.number)}`} title={a.title}>
      <Facts
        rows={[
          ['Issued', a.issued_at ? formatInZone(a.issued_at, frame.zone, 'MMM d, yyyy h:mm a') : 'Not issued'],
          ['Files', a.file_ids.length > 0 ? String(a.file_ids.length) : null],
        ]}
      />
      {a.body ? <p className="whitespace-pre-wrap break-words text-ink">{a.body}</p> : null}
    </EntityPane>
  );
}

export function QuestionEntity({ frame, id }: KindProps) {
  const q = useBidQuestions(frame.projectId);
  if (q.isPending) return <LoadingState label="Loading the question" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const row = q.data.find((x) => x.id === id);
  if (!row) return <EntityPane frame={{ ...frame, open: null }} label="Question" title="This question isn't here." />;
  const chip = questionChip(row.status);
  return (
    <EntityPane frame={frame} label={`Question ${String(row.number)}`} title={row.question}>
      <Facts
        rows={[
          ['Status', <StatusChip key="status" status={chip.status} label={chip.label} />],
          ['Asked', formatInZone(row.created_at, frame.zone, 'MMM d, yyyy h:mm a')],
        ]}
      />
    </EntityPane>
  );
}

export function AnswerEntity({ frame, id }: KindProps) {
  const q = usePublishedAnswer(frame.projectId, id);
  if (q.isPending) return <LoadingState label="Loading the answer" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data === null) return <EntityPane frame={{ ...frame, open: null }} label="Answer" title="This answer isn't here." />;
  const a = q.data;
  return (
    <EntityPane frame={frame} label={`Answer ${String(a.number)}`} title={a.question_text}>
      <Facts
        rows={[
          ['Answer', a.answer],
          ['Published', formatInZone(a.published_at, frame.zone, 'MMM d, yyyy h:mm a')],
        ]}
      />
    </EntityPane>
  );
}
