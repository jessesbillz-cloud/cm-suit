// Posting from the delivery link: the typed name (remembered on this device, like MDR), then the same form as the
// app. The name goes on the receipt and in the log. Where the browser blocks storage (Safari's "block all cookies",
// some in-app browsers) the name simply isn't remembered: the form still works.
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

/** This device's remembered value, or '' where storage is blocked. */
function recall(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch (e) {
    console.warn('Device storage is blocked; nothing remembered', e);
    return '';
  }
}

/** Remembers a value on this device; where storage is blocked it is not remembered (logged, never shown). */
function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    console.warn('Device storage is blocked; not remembered', e);
  }
}

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
  const [name, setName] = useState(() => recall(NAME_KEY));
  const [value, setValue] = useState<DeliveryInput>(() => ({
    company: recall(COMPANY_KEY),
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
                remember(NAME_KEY, name.trim());
                remember(COMPANY_KEY, value.company.trim());
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
