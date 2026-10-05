// A permit's reviews (0061): deferred items, addenda and change orders are reviews under the one permit. Every cycle
// is a card, open ones first (the server's order), several open at once. For the official: one "New review", which
// asks only the kind (nothing to ask for the first review of a permit not yet issued: the initial one), and
// "Backcheck" on the cycle of a review that came back to be resubmitted.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useOpenReview } from '../../data/permits.mutations';
import type { PermitDetail } from '../../data/permits.types';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { DropMenu } from './DropMenu';
import { backcheckOffered, newReviewKinds } from './model';
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
  const [menu, setMenu] = useState(false);
  const p = detail.permit;
  const canOpen = detail.can.manage && !CLOSED.includes(p.stage);
  if (detail.reviews.length === 0 && !canOpen) return null;
  const kinds = newReviewKinds(p.stage, detail.reviews.length);

  function open(kind: string) {
    setMenu(false);
    openReview.mutate(
      { projectId: p.project_id, permitId: p.id, kind, key },
      {
        onSuccess: () => {
          setKey(crypto.randomUUID());
        },
        onError: (e) => {
          toast.show({ tone: 'error', message: messageOf(e) });
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-2" data-testid="permit-reviews">
      <div className="relative flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-ink-3">Reviews</h2>
        {canOpen ? (
          <Button
            size="sm"
            variant="secondary"
            icon={Plus}
            loading={openReview.isPending}
            aria-expanded={menu}
            data-testid="permit-review-open"
            onClick={() => {
              if (kinds.length === 0) open('initial');
              else setMenu(!menu);
            }}
          >
            New review
          </Button>
        ) : null}
        <DropMenu open={menu} align="right" onClose={() => { setMenu(false); }}>
            {kinds.map((k) => (
              <button
                key={k.value}
                type="button"
                role="menuitem"
                data-testid={`permit-review-kind-${k.value}`}
                className="px-3.5 py-2 text-left text-sm text-ink hover:bg-page"
                onClick={() => {
                  open(k.value);
                }}
              >
                {k.label}
              </button>
            ))}
        </DropMenu>
      </div>
      {detail.reviews.map((r) => (
        <ReviewCard
          key={r.id}
          projectId={p.project_id}
          review={r}
          canManage={detail.can.manage}
          canRespond={detail.can.respond}
          canBackcheck={canOpen && backcheckOffered(r, detail.reviews)}
        />
      ))}
    </section>
  );
}
