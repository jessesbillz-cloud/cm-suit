// GC review (the job has the GC step on, or takes OFS requests: those always pass the GC): requests waiting on the GC,
// oldest day first.
import { ChevronRight } from 'lucide-react';
import { useIrReview } from '../../data/inspections.queries';
import { formatDay } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { firstLine, typeLabel } from './model';
import { clockLabel } from './time';

const SELECTED = 'bg-accent-soft/60 shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]';

interface ReviewViewProps {
  projectId: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

export function ReviewView({ projectId, selectedId, onOpen }: ReviewViewProps) {
  const review = useIrReview(projectId);
  return (
    <Card padded={false} className="overflow-hidden">
      {review.isPending ? <LoadingState label="Loading requests to review" /> : null}
      {review.isError ? <ErrorState error={review.error} onRetry={() => void review.refetch()} /> : null}
      {review.data?.length === 0 ? <EmptyState icon={TOOL_META.inspections.icon} title="Nothing to review." /> : null}
      {review.data && review.data.length > 0 ? (
        <ul className="divide-y divide-line">
          {review.data.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                data-testid={`ir-review-${String(r.number)}`}
                className={`flex min-h-[64px] w-full items-start gap-3 px-4 py-3 text-left sm:gap-4 ${r.id === selectedId ? SELECTED : 'hover:bg-page/60'}`}
                onClick={() => {
                  onOpen(r.id);
                }}
              >
                <span className="w-24 shrink-0 pt-px">
                  <span className="block text-sm font-semibold text-ink">{formatDay(r.request_date, 'EEE, MMM d')}</span>
                  <span className="block text-xs tabular-nums text-ink-3">{clockLabel(r.start_time)}</span>
                </span>
                <span className="min-w-0 flex-1 break-words text-sm">
                  <span className="mr-2 tabular-nums text-ink-3">IR {r.number}</span>
                  <span className="font-semibold text-ink">{typeLabel(r.kind, r.ir_special_kinds?.name ?? null)}</span>
                  <span className="block text-ink-2">{firstLine(r.items)}</span>
                  <span className="block text-[13px] text-ink-3">{r.company}</span>
                </span>
                <Icon icon={ChevronRight} size={16} className="mt-0.5 shrink-0 text-ink-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
