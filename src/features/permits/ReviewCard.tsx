// One cycle of a review: "Review 2 BC 1 · Fire sprinkler (deferred)" (the review's number on the permit, its backcheck,
// its kind), received and returned, its outcome, and its comments as a tight list. While it is open the official adds
// comments (sheet, detail, code reference, comment) and closes it with the outcome, with Undo (which opens it again).
// Once it came back to be resubmitted, "Backcheck" opens the review's next cycle, with Undo (0080: taken back while it
// has no comments; the next Backcheck opens it again, same number).
import { useState } from 'react';
import { Lock, Plus } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useAddComment, useBackcheckReview, useCloseReview, useWithdrawBackcheck } from '../../data/permits.mutations';
import type { PermitReviewWithComments } from '../../data/permits.types';
import { formatDay } from '../../lib/dates';
import type { StatusKey } from '../../lib/status';
import { Button } from '../../ui/Button';
import { FIELD_AREA, FIELD_LABEL, SelectField, TextField } from '../../ui/Fields';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { CommentRow } from './CommentRow';
import { OUTCOMES, outcomeLabel, reviewKindLabel, reviewTitle } from './model';

interface ReviewCardProps {
  projectId: string;
  review: PermitReviewWithComments;
  canManage: boolean;
  canRespond: boolean;
  /** The official may open this review's next backcheck from here. */
  canBackcheck: boolean;
}

const OUTCOME_CHIP: Record<string, StatusKey> = {
  approved: 'approved',
  approved_as_noted: 'approved',
  revise_resubmit: 'postponed',
  rejected: 'not_approved',
};

function AddComment({ projectId, reviewId }: { projectId: string; reviewId: string }) {
  const add = useAddComment();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [sheet, setSheet] = useState('');
  const [detail, setDetail] = useState('');
  const [code, setCode] = useState('');
  const [body, setBody] = useState('');
  return (
    <form
      className="flex flex-col gap-2 border-t border-line pt-3"
      data-testid="permit-comment-form"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate(
          { projectId, reviewId, body, sheet, detail, codeRef: code, key },
          {
            onSuccess: () => {
              setBody('');
              setDetail('');
              setKey(crypto.randomUUID());
            },
          },
        );
      }}
    >
      <div className="grid grid-cols-3 gap-2">
        <TextField label="Sheet" value={sheet} onChange={setSheet} maxLength={40} testId="permit-comment-sheet" />
        <TextField label="Detail" value={detail} onChange={setDetail} maxLength={40} />
        <TextField label="Code" value={code} onChange={setCode} maxLength={80} testId="permit-comment-code" />
      </div>
      <label className={FIELD_LABEL}>
        Comment
        <textarea
          rows={2}
          maxLength={4000}
          className={FIELD_AREA}
          value={body}
          data-testid="permit-comment-body"
          onChange={(e) => {
            setBody(e.target.value);
          }}
        />
      </label>
      {add.isError ? <p className="text-sm text-danger">{messageOf(add.error)}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="secondary" icon={Plus} loading={add.isPending} disabled={body.trim() === ''} data-testid="permit-comment-add">
          Add comment
        </Button>
      </div>
    </form>
  );
}

function CloseReview({ projectId, review }: { projectId: string; review: PermitReviewWithComments }) {
  const close = useCloseReview();
  const toast = useToast();
  const [outcome, setOutcome] = useState<string>('revise_resubmit');
  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
      <SelectField label="Outcome" value={outcome} options={OUTCOMES} onChange={setOutcome} testId="permit-review-outcome" className="min-w-0 flex-1" />
      <Button
        variant="secondary"
        icon={Lock}
        loading={close.isPending}
        data-testid="permit-review-close"
        onClick={() => {
          close.mutate(
            { projectId, review, outcome },
            {
              onSuccess: (row) => {
                toast.show({
                  message: `${reviewTitle(review.review_no, review.backcheck)} closed.`,
                  action: { label: 'Undo', onClick: () => { close.mutate({ projectId, review: row, outcome: null }, { onError: failed }); } },
                });
              },
              onError: failed,
            },
          );
        }}
      >
        Close review
      </Button>
    </div>
  );
}

function Backcheck({ projectId, reviewId }: { projectId: string; reviewId: string }) {
  const backcheck = useBackcheckReview();
  const withdraw = useWithdrawBackcheck();
  const toast = useToast();
  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  // The button's key: a repeat of the same tap returns the same cycle.
  const [key] = useState(() => crypto.randomUUID());
  return (
    <div className="flex justify-end border-t border-line pt-3">
      <Button
        size="sm"
        variant="secondary"
        icon={Plus}
        loading={backcheck.isPending}
        data-testid="permit-review-backcheck"
        onClick={() => {
          backcheck.mutate(
            { projectId, reviewId, key },
            {
              onSuccess: (row) => {
                toast.show({
                  message: `${reviewTitle(row.review_no, row.backcheck)} opened.`,
                  action: { label: 'Undo', onClick: () => { withdraw.mutate({ projectId, review: row }, { onError: failed }); } },
                });
              },
              onError: failed,
            },
          );
        }}
      >
        Backcheck
      </Button>
    </div>
  );
}

export function ReviewCard({ projectId, review, canManage, canRespond, canBackcheck }: ReviewCardProps) {
  const open = review.outcome === null;
  const received = `Received ${formatDay(review.received_on, 'MMM d')}`;
  const returned = review.returned_on ? `Returned ${formatDay(review.returned_on, 'MMM d')}` : null;
  return (
    <section
      className="flex flex-col gap-1 rounded-lg border border-line bg-card p-3.5"
      data-testid={`permit-review-${String(review.cycle)}`}
      data-open={open ? 'true' : 'false'}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-5 text-ink">
            {reviewTitle(review.review_no, review.backcheck)} · {reviewKindLabel(review.kind)}
          </h3>
          <p className="text-[13px] leading-5 text-ink-2">
            <span className="whitespace-nowrap">{received}</span>
            {returned ? <span className="whitespace-nowrap"> · {returned}</span> : null}
          </p>
        </div>
        {open ? <StatusChip status="pending" label="Open" /> : <StatusChip status={OUTCOME_CHIP[review.outcome ?? ''] ?? 'pending'} label={outcomeLabel(review.outcome ?? '')} />}
      </div>
      {review.comments.length > 0 ? (
        <ul className="divide-y divide-line">
          {review.comments.map((c) => (
            <CommentRow key={c.id} projectId={projectId} comment={c} canRespond={canRespond} canManage={canManage} />
          ))}
        </ul>
      ) : null}
      {open && canManage ? <AddComment projectId={projectId} reviewId={review.id} /> : null}
      {open && canManage ? <CloseReview projectId={projectId} review={review} /> : null}
      {canBackcheck ? <Backcheck projectId={projectId} reviewId={review.id} /> : null}
    </section>
  );
}
