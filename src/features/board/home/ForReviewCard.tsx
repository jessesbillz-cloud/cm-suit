// The home's lead box for whoever reviews fire / life safety items for OFS (ofs.review): "For review" with how many wait,
// each one a tap from its place in the job's For review.
import { useNavigate } from '@tanstack/react-router';
import { useOfsReview } from '../../../data/ofs';
import { useMyProjects } from '../../../data/queries';
import { formatInZone } from '../../../lib/dates';
import { ROW_HOVER } from '../../../ui/box';
import { Card } from '../../../ui/Card';
import { ErrorState, LoadingState } from '../../../ui/States';
import { rowTitle } from '../../ofs/model';
import { useProjectZones } from '../zones';
import { CountTitle } from './CountTitle';

export function ForReviewCard() {
  const review = useOfsReview(null);
  const projects = useMyProjects();
  const zoneOf = useProjectZones();
  const navigate = useNavigate();
  const rows = (review.data ?? []).filter((r) => r.decision === null);
  const jobName = (id: string) => projects.data?.find((p) => p.project_id === id)?.name ?? '';

  return (
    <div data-testid="home-review">
      <Card title={<CountTitle label="For review" count={review.isSuccess ? rows.length : null} testId="home-review-count" />} padded={false}>
        {review.isPending ? <LoadingState label="Loading for review" /> : null}
        {review.isError ? <ErrorState error={review.error} title="For review did not load." onRetry={() => void review.refetch()} /> : null}
        {review.isSuccess && rows.length === 0 ? <p className="px-4 py-3 text-sm text-ink-2">Nothing waiting.</p> : null}
        {rows.length > 0 ? (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  data-testid="home-review-row"
                  className={`flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left ${ROW_HOVER}`}
                  onClick={() => {
                    void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId: r.project_id, tool: 'review', itemId: r.id } });
                  }}
                >
                  <span className="break-words text-sm font-medium text-ink wrap-anywhere">{rowTitle(r)}</span>
                  <span className="text-xs text-ink-2">
                    {jobName(r.project_id)} · {formatInZone(r.sent_at, zoneOf(r.project_id), 'MMM d')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
