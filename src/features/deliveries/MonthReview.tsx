// "I reviewed this month" (SPEC §13.3): name and company, prefilled; the time is the server's. deliveries.manage.
import { useState, type FormEvent } from 'react';
import { useUser } from '../../data/auth';
import { useDeliveryReviews } from '../../data/deliveries.queries';
import { useReviewMonth } from '../../data/deliveries.mutations';
import { messageOf } from '../../data/errors';
import { usePeopleDisplay, useProfile } from '../../data/queries';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Fields';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';

interface MonthReviewProps {
  projectId: string;
  /** 'yyyy-MM-01' */
  month: string;
  tz: string;
}

interface ReviewFormProps {
  projectId: string;
  month: string;
  name: string;
  company: string;
}

function ReviewForm({ projectId, month, name: initialName, company: initialCompany }: ReviewFormProps) {
  const [name, setName] = useState(initialName);
  const [company, setCompany] = useState(initialCompany);
  const review = useReviewMonth(projectId);
  const toast = useToast();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    review.mutate(
      { month, name: name.trim(), company: company.trim() },
      {
        onError: (err) => {
          toast.show({ tone: 'error', message: `Not recorded: ${messageOf(err)}` });
        },
      },
    );
  };
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
      <TextField className="min-w-40 flex-1" label="Name" value={name} autoComplete="name" onChange={setName} />
      <TextField className="min-w-40 flex-1" label="Company" value={company} autoComplete="organization" onChange={setCompany} />
      <Button type="submit" variant="primary" loading={review.isPending} disabled={name.trim() === ''} data-testid="delivery-review">
        I reviewed this month
      </Button>
    </form>
  );
}

export function MonthReview({ projectId, month, tz }: MonthReviewProps) {
  const reviews = useDeliveryReviews(projectId, month, true);
  const profile = useProfile();
  const people = usePeopleDisplay(projectId);
  const me = useUser();

  if (reviews.isPending || profile.isPending || people.isPending) return <LoadingState label="Loading reviews" />;
  if (reviews.isError) return <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />;
  if (profile.isError) return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;
  if (people.isError) return <ErrorState error={people.error} onRetry={() => void people.refetch()} />;
  const mine = reviews.data.some((r) => r.created_by === me.id);
  const company = people.data.find((p) => p.user_id === me.id)?.company ?? profile.data.company ?? '';

  return (
    <section className="flex flex-col gap-2" aria-label="Review">
      {reviews.data.map((r) => (
        <p key={r.id} className="text-sm text-ink">
          Reviewed by {r.name}
          {r.company ? `, ${r.company}` : ''} <span className="text-ink-2">· {formatInZone(r.created_at, tz, 'MMM d, h:mm a')}</span>
        </p>
      ))}
      {mine ? null : <ReviewForm projectId={projectId} month={month} name={profile.data.full_name} company={company} />}
    </section>
  );
}
