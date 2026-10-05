// One package on the bidder's page: scope, intent (Bidding / Not bidding, with an optional one-line reason),
// and Submit bid = one file in any format, through the one upload queue (progress, Stop). The receipt comes back:
// number and server time. Every version they sent opens with one click (Download); none can be deleted (a new
// version supersedes the old).
import { useState } from 'react';
import { Check, Download, Upload } from 'lucide-react';
import { useQueueBid, useSetBidIntent } from '../../data/bidder';
import type { BidderPackage, BidderSubmission } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { useUploadQueue } from '../../data/UploadQueue';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { useDownload } from '../files/useDownload';
import { inviteChip } from './model';

interface BidderPackageCardProps {
  projectId: string;
  pkg: BidderPackage;
  folderId: string | null;
  tz: string;
}

const TIME = 'MMM d, yyyy h:mm a';

/** The file they sent with this receipt, one click. */
function DownloadOwn({ s }: { s: BidderSubmission }) {
  const download = useDownload();
  return (
    <Button
      size="sm"
      variant="quiet"
      icon={Download}
      aria-label={`Download version ${String(s.version_no)}`}
      data-testid={`bid-download-${String(s.version_no)}`}
      loading={download.pendingId === s.file_id}
      onClick={() => {
        download.start(s.file_id);
      }}
    />
  );
}

function Receipt({ s, tz }: { s: BidderSubmission; tz: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-page px-3 py-1.5 text-sm text-ink" data-testid="bid-receipt">
      <Icon icon={Check} size={16} className="shrink-0 text-ink-2" />
      <span className="font-medium">Receipt #{s.receipt_number}</span>
      <span className="tabular-nums text-ink-2">{formatInZone(s.received_at, tz, TIME)}</span>
      {s.is_late ? <StatusChip status="postponed" label="Late" /> : null}
      <span className="flex-1" />
      <DownloadOwn s={s} />
    </div>
  );
}

/** The package's title: its code in quiet numerals, then its name. */
function Title({ pkg }: { pkg: BidderPackage }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className="tabular-nums text-ink-2">{pkg.code}</span>
      <span className="break-words">{pkg.name}</span>
    </span>
  );
}

/** Where this bidder stands on the package, once they've said (colors from lib/status). */
function IntentChip({ status }: { status: string | null }) {
  if (status !== 'intends' && status !== 'declined' && status !== 'submitted' && status !== 'late') return null;
  const chip = inviteChip(status);
  return <StatusChip status={chip.status} label={chip.label} />;
}

interface SubmitFileProps {
  code: string;
  label: string;
  busy: boolean;
  onFile: (file: File) => void;
}

/** "Submit bid": the accent button is the file picker itself, so one click opens it. */
function SubmitFile({ code, label, busy, onFile }: SubmitFileProps) {
  return (
    <label className="inline-flex h-11 w-fit cursor-pointer items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-white shadow-primary hover:bg-accent-hover focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
      <Upload size={18} strokeWidth={1.75} aria-hidden="true" />
      {label}
      <input
        type="file"
        className="sr-only"
        data-testid={`bid-submit-${code}`}
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

export function BidderPackageCard({ projectId, pkg, folderId, tz }: BidderPackageCardProps) {
  const intent = useSetBidIntent();
  const queueBid = useQueueBid();
  const queue = useUploadQueue();
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  // One bid at a time per page: Submit waits while one of mine is going up.
  const busy = folderId !== null && queue.items.some((i) => i.folderId === folderId && (i.status === 'queued' || i.status === 'uploading'));

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
    queueBid({ projectId, packageId: pkg.id, folderId, file });
  }

  return (
    <Card title={<Title pkg={pkg} />} actions={<IntentChip status={status} />}>
      <div className="flex flex-col gap-4">
        {pkg.scope_text !== '' ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink">{pkg.scope_text}</p> : null}
        {current ? <Receipt s={current} tz={tz} /> : null}
        <div className="flex flex-wrap items-center gap-2">
          {pkg.invite && !submitted ? (
            <>
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
            </>
          ) : null}
          <span className="hidden flex-1 sm:block" />
          {folderId !== null ? (
            <SubmitFile code={pkg.code} label={current ? 'Submit new version' : 'Submit bid'} busy={busy} onFile={send} />
          ) : (
            <p className="text-sm text-danger">Submitting is not set up on this job.</p>
          )}
        </div>
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
              className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-card px-2.5 text-sm text-ink shadow-control outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20"
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
        {problem ? <p className="text-sm text-danger">{problem}</p> : null}
        {older.length > 0 ? (
          <ul className="flex flex-col gap-0.5 border-t border-line pt-2 text-xs tabular-nums text-ink-2">
            {older.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="flex-1">
                  v{s.version_no} · Receipt #{s.receipt_number} · {formatInZone(s.received_at, tz, TIME)}
                  {s.is_late ? ' · Late' : ''}
                </span>
                <DownloadOwn s={s} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
