// Per-file upload progress for the folder being viewed. The queue itself lives above the router (data/UploadQueue).
import { RotateCcw, X } from 'lucide-react';
import { useUploadQueue, type UploadItem } from '../../data/UploadQueue';
import { formatBytes } from '../../lib/format';
import { Button } from '../../ui/Button';

interface UploadLineProps {
  item: UploadItem;
  onCancel: (key: number) => void;
  onRetry: (key: number) => void;
}

function statusText(item: UploadItem): string {
  switch (item.status) {
    case 'queued':
      return 'Waiting';
    case 'uploading':
      return `${formatBytes(item.loaded)} of ${formatBytes(item.size)}`;
    case 'done':
      return 'Uploaded; scanning';
    case 'cancelled':
      return 'Cancelled';
    default:
      return item.error ?? 'Failed';
  }
}

function UploadLine({ item, onCancel, onRetry }: UploadLineProps) {
  const pct = item.size > 0 ? Math.min(100, Math.round((item.loaded / item.size) * 100)) : 100;
  const active = item.status === 'queued' || item.status === 'uploading';
  return (
    <li className="flex items-center gap-3 px-4 py-2" data-testid="upload-line">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm text-ink">{item.name}</p>
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label={`Upload progress for ${item.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className={`h-full ${item.status === 'failed' ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${String(pct)}%` }} />
        </div>
        <p className={`mt-1 text-xs ${item.status === 'failed' ? 'text-danger' : 'text-ink-2'}`}>{statusText(item)}</p>
      </div>
      {active ? (
        <Button size="sm" variant="quiet" icon={X} aria-label={`Cancel ${item.name}`} onClick={() => {
            onCancel(item.key);
          }}
        />
      ) : null}
      {item.status === 'failed' || item.status === 'cancelled' ? (
        <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => {
            onRetry(item.key);
          }}
        >
          Retry
        </Button>
      ) : null}
    </li>
  );
}

export function UploadList({ folderId }: { folderId: string }) {
  const queue = useUploadQueue();
  const items = queue.items.filter((i) => i.folderId === folderId);
  if (items.length === 0) return null;
  const finished = items.some((i) => i.status === 'done' || i.status === 'cancelled');
  return (
    <div className="border-b border-line">
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <UploadLine key={i.key} item={i} onCancel={queue.cancel} onRetry={queue.retry} />
        ))}
      </ul>
      {finished ? (
        <div className="flex justify-end px-4 py-2">
          <Button size="sm" variant="quiet" onClick={queue.clearFinished}>
            Clear finished
          </Button>
        </div>
      ) : null}
    </div>
  );
}
