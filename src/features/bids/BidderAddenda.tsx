// Addenda for a bidder: each one with its files and a one-click Acknowledge that turns into the acknowledged date.
import { Check } from 'lucide-react';
import { useAcknowledgeAddendum } from '../../data/bidder';
import type { BidderPage } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { useToast } from '../../ui/Toast';
import { FileLine } from './FileLine';

interface BidderAddendaProps {
  projectId: string;
  addenda: BidderPage['addenda'];
  tz: string;
}

export function BidderAddenda({ projectId, addenda, tz }: BidderAddendaProps) {
  const ack = useAcknowledgeAddendum();
  const toast = useToast();
  return (
    <Card title="Addenda" padded={false}>
      <ul className="divide-y divide-line">
        {addenda.map((a) => (
          <li key={a.id} className="flex flex-col gap-2 px-4 py-3">
            <h3 className="break-words text-sm font-semibold text-ink">
              <span className="mr-2 tabular-nums text-ink-2">{a.number}</span>
              {a.title}
            </h3>
            {a.body !== '' ? <p className="whitespace-pre-wrap break-words text-sm text-ink">{a.body}</p> : null}
            {a.file_ids.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {a.file_ids.map((id) => (
                  <FileLine key={id} fileId={id} />
                ))}
              </ul>
            ) : null}
            {a.acked_at !== null ? (
              <p className="flex items-center gap-1.5 text-sm text-ink-2" data-testid={`addendum-acked-${String(a.number)}`}>
                <Check size={16} strokeWidth={1.75} aria-hidden="true" />
                Acknowledged {formatInZone(a.acked_at, tz, 'MMM d, yyyy')}
              </p>
            ) : (
              <Button
                variant="primary"
                className="w-fit"
                data-testid={`addendum-ack-${String(a.number)}`}
                onClick={() => {
                  ack.mutate(
                    { projectId, addendumId: a.id },
                    {
                      onError: (e) => {
                        toast.show({ tone: 'error', message: `Not acknowledged: ${messageOf(e)}` });
                      },
                    },
                  );
                }}
              >
                Acknowledge
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
