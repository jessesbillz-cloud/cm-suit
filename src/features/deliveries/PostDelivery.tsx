// Post a delivery from the app (right column, item 'new'). Prefilled: the picked day and my company when it is on the
// job's list. After posting, the receipt opens in its place.
import { useState } from 'react';
import { useUser } from '../../data/auth';
import { useDeliveries, useDeliveryCompanies } from '../../data/deliveries.queries';
import { usePostDelivery } from '../../data/deliveries.mutations';
import type { DeliveryInput } from '../../data/deliveries.types';
import { messageOf } from '../../data/errors';
import { usePeopleDisplay } from '../../data/queries';
import { Card } from '../../ui/Card';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { headsUpFor } from './headsUp';
import { PostForm } from './PostForm';

interface PostDeliveryProps {
  projectId: string;
  tz: string;
  day: string;
  onPosted: (id: string) => void;
}

interface PostFormCardProps extends PostDeliveryProps {
  companies: string[];
  myCompany: string;
}

function PostFormCard({ projectId, tz, day, onPosted, companies, myCompany }: PostFormCardProps) {
  const [value, setValue] = useState<DeliveryInput>({
    company: companies.includes(myCompany) ? myCompany : '',
    date: day,
    time: '',
    duration_min: 60,
    description: '',
  });
  const sameDay = useDeliveries(projectId, value.date || day, value.date || day);
  const post = usePostDelivery(projectId);
  const toast = useToast();
  const headsUp = headsUpFor(sameDay.data ?? [], value, tz);

  return (
    <Card title="Post delivery">
      <PostForm
        value={value}
        onChange={setValue}
        companies={companies}
        headsUp={headsUp}
        busy={post.isPending}
        submitLabel={headsUp ? 'Post as Standby' : 'Post delivery'}
        onSubmit={() => {
          post.mutate(value, {
            onSuccess: onPosted,
            onError: (e) => {
              toast.show({ tone: 'error', message: `Not posted: ${messageOf(e)}` });
            },
          });
        }}
      />
    </Card>
  );
}

export function PostDelivery(props: PostDeliveryProps) {
  const companies = useDeliveryCompanies(props.projectId);
  const people = usePeopleDisplay(props.projectId);
  const me = useUser();

  if (companies.isPending || people.isPending) return <LoadingState label="Opening the form" />;
  if (companies.isError) return <ErrorState error={companies.error} onRetry={() => void companies.refetch()} />;
  if (people.isError) return <ErrorState error={people.error} onRetry={() => void people.refetch()} />;
  const myCompany = people.data.find((p) => p.user_id === me.id)?.company ?? '';
  return <PostFormCard {...props} companies={companies.data.map((c) => c.name)} myCompany={myCompany} />;
}
