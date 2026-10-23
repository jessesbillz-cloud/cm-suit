// For review (Jesse, Oct 22): the fire / life safety RFIs and submittals the design team has answered, for whoever reviews
// them for OFS (ofs.review). Waiting first and open, then Done (Approved, Not approved), each with Submittals by spec
// section and RFIs by number, a count on every group. A row opens the item beside the list (the document with the
// design team's answer or stamp, and the two boxes).
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useOfsReview } from '../../data/ofs';
import type { OfsReviewRow } from '../../data/ofs.types';
import { useCapability } from '../../data/queries';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { useProjectZones } from '../board/zones';
import { Expander } from './Expander';
import { reviewTree } from './model';
import { ReviewBranch } from './ReviewBranch';

const META = TOOL_META.review;

interface ReviewToolProps {
  projectId: string;
  itemId: string | null;
}

/** Open at first: Waiting and everything in it. Done waits for a tap. */
function startsOpen(id: string): boolean {
  return id === 'waiting' || id.startsWith('waiting/');
}

function ReviewList({ projectId, itemId }: ReviewToolProps) {
  const review = useOfsReview(projectId);
  const zoneOf = useProjectZones();
  const navigate = useNavigate();
  // Each group's own choice; a group nobody touched keeps its first state.
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const isOpen = (id: string) => startsOpen(id) !== flipped.has(id);
  const toggle = (id: string) => {
    setFlipped((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const open = (row: OfsReviewRow) => {
    void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'review', itemId: row.id } });
  };

  if (review.isPending) return <LoadingState label="Loading for review" />;
  if (review.isError) return <ErrorState error={review.error} onRetry={() => void review.refetch()} />;
  const t = reviewTree(review.data);
  const zone = zoneOf(projectId);
  const done = t.approved.count + t.notApproved.count;
  const common = { zone, selectedId: itemId, onOpen: open, isOpen, toggle };

  return (
    <div data-testid="ofs-review">
      <PageHeader title={META.label} icon={META.icon} meta={t.waiting.count > 0 ? `${String(t.waiting.count)} waiting` : 'Nothing waiting'} />
      {review.data.length === 0 ? (
        <Card>
          <EmptyState icon={META.icon} title="Nothing for review yet." />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <Expander id="waiting" label="Waiting" count={t.waiting.count} open={isOpen('waiting')} onToggle={toggle}>
            {t.waiting.count === 0 ? <p className="px-1 text-sm text-ink-2">None waiting.</p> : null}
            <ReviewBranch id="waiting" branch={t.waiting} depth={1} {...common} />
          </Expander>
          {done > 0 ? (
            <Expander id="done" label="Done" count={done} open={isOpen('done')} onToggle={toggle}>
              {t.approved.count > 0 ? (
                <Expander id="approved" label="Approved" count={t.approved.count} open={isOpen('approved')} onToggle={toggle} depth={1}>
                  <ReviewBranch id="approved" branch={t.approved} depth={2} {...common} />
                </Expander>
              ) : null}
              {t.notApproved.count > 0 ? (
                <Expander id="not_approved" label="Not approved" count={t.notApproved.count} open={isOpen('not_approved')} onToggle={toggle} depth={1}>
                  <ReviewBranch id="not_approved" branch={t.notApproved} depth={2} {...common} />
                </Expander>
              ) : null}
            </Expander>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function ReviewTool({ projectId, itemId }: ReviewToolProps) {
  const reviews = useCapability(projectId, 'ofs.review');
  if (reviews.isPending) return <LoadingState label="Loading for review" />;
  if (reviews.isError) return <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />;
  if (!reviews.data) {
    return (
      <div>
        <PageHeader title={META.label} icon={META.icon} />
        <Card>
          <EmptyState icon={META.icon} title="Nothing for review for you on this job." />
        </Card>
      </div>
    );
  }
  return <ReviewList projectId={projectId} itemId={itemId} />;
}
