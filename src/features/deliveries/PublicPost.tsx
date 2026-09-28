// Posting from the delivery link: the typed name (remembered on this device, like MDR), then the same form as the
// app. The name goes on the receipt and in the log.
import { useState } from 'react';
import { useLinkBoard, useLinkPost } from '../../data/deliveryLink';
import type { DeliveryInput, LinkReceipt } from '../../data/deliveries.types';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { TextField } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';
import { headsUpFor } from './headsUp';
import { PostForm } from './PostForm';

const NAME_KEY = 'app:delivery-name';
const COMPANY_KEY = 'app:delivery-company';

interface PublicPostProps {
  projectId: string;
  token: string;
  tz: string;
  day: string;
  companies: string[];
  onPosted: (receipt: LinkReceipt) => void;
  onCancel: () => void;
}

export function PublicPost({ projectId, token, tz, day, companies, onPosted, onCancel }: PublicPostProps) {
  const [name, setName] = useState(() => window.localStorage.getItem(NAME_KEY) ?? '');
  const [value, setValue] = useState<DeliveryInput>(() => ({
    company: window.localStorage.getItem(COMPANY_KEY) ?? '',
    date: day,
    time: '',
    duration_min: 60,
    description: '',
  }));
  const sameDay = useLinkBoard(projectId, token, value.date || day, value.date || day);
  const post = useLinkPost(projectId, token);
  const toast = useToast();
  const headsUp = headsUpFor(sameDay.data?.deliveries ?? [], value, tz);

  return (
    <Card
      title="Post delivery"
      actions={
        <Button size="sm" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      }
    >
      <PostForm
        value={value}
        onChange={setValue}
        companies={companies}
        headsUp={headsUp}
        busy={post.isPending}
        blocked={name.trim() === ''}
        submitLabel={headsUp ? 'Post as Standby' : 'Post delivery'}
        onSubmit={() => {
          post.mutate(
            { name: name.trim(), input: value },
            {
              onSuccess: (receipt) => {
                window.localStorage.setItem(NAME_KEY, name.trim());
                window.localStorage.setItem(COMPANY_KEY, value.company.trim());
                onPosted(receipt);
              },
              onError: (e) => {
                toast.show({ tone: 'error', message: `Not posted: ${messageOf(e)}` });
              },
            },
          );
        }}
      >
        <TextField label="Your name" value={name} autoComplete="name" testId="delivery-name" onChange={setName} />
      </PostForm>
    </Card>
  );
}
