// GC review (only when the job has the GC step on): requests waiting on the GC, oldest day first.
import { useIrReview } from '../../data/inspections.queries';
import { formatDay } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { firstLine, typeLabel } from './model';
import { clockLabel } from './time';

interface ReviewViewProps {
  projectId: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

export function ReviewView({ projectId, selectedId, onOpen }: ReviewViewProps) {
  const review = useIrReview(projectId);
  return (
    <Card padded={false}>
      {review.isPending ? <LoadingState label="Loading requests to review" /> : null}
      {review.isError ? <ErrorState error={review.error} onRetry={() => void review.refetch()} /> : null}
      {review.data?.length === 0 ? <EmptyState title="Nothing to review." /> : null}
      {review.data && review.data.length > 0 ? (
        <ul className="divide-y divide-line">
          {review.data.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={`flex w-full items-start gap-3 px-4 py-3 text-left ${r.id === selectedId ? 'bg-accent-soft' : 'hover:bg-page'}`}
                onClick={() => {
                  onOpen(r.id);
                }}
              >
                <span className="w-28 shrink-0 text-sm text-ink-2">
                  {formatDay(r.request_date, 'EEE, MMM d')}
                  <br />
                  {clockLabel(r.start_time)}
                </span>
                <span className="min-w-0 flex-1 break-words text-sm text-ink">
                  <span className="mr-2 tabular-nums text-ink-2">IR {r.number}</span>
                  {typeLabel(r.kind, r.ir_special_kinds?.name ?? null)} · {r.company}
                  <span className="block text-ink-2">{firstLine(r.items)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
