// One package on the bidder's page: scope, intent (Bidding / Not bidding, with an optional one-line reason),
// and Submit bid = one file in any format. The receipt is all that comes back: number and server time.
import { useState } from 'react';
import { Upload } from 'lucide-react';
import { useSetBidIntent, useSubmitBid } from '../../data/bidder';
import type { BidderPackage, BidderSubmission } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { StatusChip } from '../../ui/StatusChip';

interface BidderPackageCardProps {
  projectId: string;
  pkg: BidderPackage;
  folderId: string | null;
  tz: string;
}

const TIME = 'MMM d, yyyy h:mm a';

function Receipt({ s, tz }: { s: BidderSubmission; tz: string }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-ink" data-testid="bid-receipt">
      Receipt #{s.receipt_number} · {formatInZone(s.received_at, tz, TIME)}
      {s.is_late ? <StatusChip status="postponed" label="Late" /> : null}
    </p>
  );
}

export function BidderPackageCard({ projectId, pkg, folderId, tz }: BidderPackageCardProps) {
  const intent = useSetBidIntent();
  const submit = useSubmitBid();
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const status = pkg.invite?.status ?? null;
  const submitted = status === 'submitted' || status === 'late';
  const [current, ...older] = pkg.submissions;
  const onError = (e: Error) => {
    setProblem(messageOf(e));
  };

  function setIntent(next: 'intends' | 'declined', why?: string) {
    if (!pkg.invite) return;
    setProblem(null);
    intent.mutate({ projectId, inviteId: pkg.invite.id, intent: next, reason: why }, { onError });
  }

  function send(file: File) {
    if (folderId === null) return;
    setProblem(null);
    setProgress(0);
    submit.mutate(
      {
        projectId,
        packageId: pkg.id,
        folderId,
        file,
        onProgress: (loaded, total) => {
          setProgress(total > 0 ? Math.round((loaded / total) * 100) : 0);
        },
      },
      {
        onError,
        onSettled: () => {
          setProgress(null);
        },
      },
    );
  }

  return (
    <Card title={`${pkg.code} ${pkg.name}`}>
      <div className="flex flex-col gap-3">
        {pkg.scope_text !== '' ? <p className="whitespace-pre-wrap break-words text-sm text-ink">{pkg.scope_text}</p> : null}
        {pkg.invite && !submitted ? (
          <div className="flex flex-wrap gap-2">
            <Button variant={status === 'intends' ? 'primary' : 'secondary'} onClick={() => {
                setAskReason(false);
                setIntent('intends');
              }}
            >
              Bidding
            </Button>
            <Button variant={status === 'declined' ? 'primary' : 'secondary'} onClick={() => {
                setAskReason(true);
                setIntent('declined');
              }}
            >
              Not bidding
            </Button>
          </div>
        ) : null}
        {askReason ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setAskReason(false);
              setIntent('declined', reason.trim());
            }}
          >
            <input
              aria-label="Reason (optional)"
              placeholder="Reason (optional)"
              maxLength={500}
              className="h-9 min-w-0 flex-1 rounded-md border border-line px-2.5 text-sm text-ink outline-none focus:border-accent"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
            />
            <Button type="submit" loading={intent.isPending}>
              Send
            </Button>
          </form>
        ) : null}
        {current ? <Receipt s={current} tz={tz} /> : null}
        {folderId !== null ? (
          <label className="inline-flex h-11 w-fit cursor-pointer items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover">
            <Upload size={18} strokeWidth={1.75} aria-hidden="true" />
            {progress !== null ? `Uploading ${String(progress)}%` : current ? 'Submit new version' : 'Submit bid'}
            <input
              type="file"
              className="sr-only"
              data-testid={`bid-submit-${pkg.code}`}
              disabled={progress !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) send(file);
              }}
            />
          </label>
        ) : (
          <p className="text-sm text-danger">Submitting is not set up on this job.</p>
        )}
        {problem ? <p className="text-sm text-danger">{problem}</p> : null}
        {older.length > 0 ? (
          <ul className="text-xs text-ink-2">
            {older.map((s) => (
              <li key={s.id}>
                v{s.version_no} · Receipt #{s.receipt_number} · {formatInZone(s.received_at, tz, TIME)}
                {s.is_late ? ' · Late' : ''}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
