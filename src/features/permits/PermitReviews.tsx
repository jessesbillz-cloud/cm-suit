// A permit's review cycles, newest first, each with its comments; "Open review" for the official when none is open
// (the first is the initial review, later ones backchecks).
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useOpenReview } from '../../data/permits.mutations';
import type { PermitDetail } from '../../data/permits.types';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { ReviewCard } from './ReviewCard';

interface PermitReviewsProps {
  detail: PermitDetail;
}

const CLOSED = ['complete', 'cancelled'];

export function PermitReviews({ detail }: PermitReviewsProps) {
  const openReview = useOpenReview();
  const toast = useToast();
  // The form's key: a repeat of the same tap returns the same review; each new review gets a new key.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const p = detail.permit;
  const canOpen = detail.can.manage && !CLOSED.includes(p.stage) && !detail.reviews.some((r) => r.outcome === null);
  if (detail.reviews.length === 0 && !canOpen) return null;
  return (
    <section className="flex flex-col gap-2" data-testid="permit-reviews">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-ink-3">Reviews</h2>
        {canOpen ? (
          <Button
            size="sm"
            variant="secondary"
            icon={Plus}
            loading={openReview.isPending}
            data-testid="permit-review-open"
            onClick={() => {
              openReview.mutate(
                { projectId: p.project_id, permitId: p.id, key },
                {
                  onSuccess: () => {
                    setKey(crypto.randomUUID());
                  },
                  onError: (e) => {
                    toast.show({ tone: 'error', message: messageOf(e) });
                  },
                },
              );
            }}
          >
            Open review
          </Button>
        ) : null}
      </div>
      {detail.reviews.map((r) => (
        <ReviewCard key={r.id} projectId={p.project_id} review={r} canManage={detail.can.manage} canRespond={detail.can.respond} />
      ))}
    </section>
  );
}
