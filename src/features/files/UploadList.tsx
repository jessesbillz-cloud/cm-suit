// Upload lines for the folder being viewed: what the queue is doing (it lives above the router, data/UploadQueue) and
// my uploads an earlier visit left unfinished. A waiting or running line can be stopped. A line that failed, was
// stopped or was left unfinished can be removed, which also takes back the files row it registered; adding the same
// file again resumes an unfinished one instead.
import { RotateCcw, Trash2, X } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useRemoveUnfinishedUpload } from '../../data/folders.mutations';
import type { FileRow } from '../../data/types';
import { useUploadQueue, type UploadItem } from '../../data/UploadQueue';
import { formatBytes } from '../../lib/format';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';

interface UploadLineProps {
  item: UploadItem;
  onStop: (key: number) => void;
  onRetry: (key: number) => void;
  onRemove: (key: number) => void;
}

function statusText(item: UploadItem): string {
  switch (item.status) {
    case 'queued':
      return 'Waiting';
    case 'uploading':
      return `${formatBytes(item.loaded)} of ${formatBytes(item.size)}`;
    case 'done':
      return item.note ?? 'Uploaded; scanning';
    case 'cancelled':
      return 'Stopped';
    default:
      return item.error ?? 'Failed';
  }
}

function UploadLine({ item, onStop, onRetry, onRemove }: UploadLineProps) {
  const pct = item.size > 0 ? Math.min(100, Math.round((item.loaded / item.size) * 100)) : 100;
  const active = item.status === 'queued' || item.status === 'uploading';
  const ended = item.status === 'failed' || item.status === 'cancelled';
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
        <p data-testid="upload-line-status" className={`mt-1 text-xs ${item.status === 'failed' ? 'text-danger' : 'text-ink-2'}`}>
          {statusText(item)}
        </p>
      </div>
      {active ? (
        <Button size="sm" variant="quiet" icon={X} className="shrink-0" aria-label={`Stop ${item.name}`} onClick={() => {
            onStop(item.key);
          }}
        >
          Stop
        </Button>
      ) : null}
      {ended ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {item.retryable ? (
            <Button size="sm" variant="secondary" icon={RotateCcw} aria-label={`Retry ${item.name}`} disabled={item.removing} onClick={() => {
                onRetry(item.key);
              }}
            >
              Retry
            </Button>
          ) : null}
          <Button size="sm" variant="quiet" icon={Trash2} aria-label={`Remove ${item.name}`} loading={item.removing} onClick={() => {
              onRemove(item.key);
            }}
          >
            Remove
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/** My upload that never finished, from an earlier visit: nothing is running, so it can only be removed (or added again). */
function LeftoverLine({ file }: { file: FileRow }) {
  const remove = useRemoveUnfinishedUpload();
  const toast = useToast();
  return (
    <li className="flex items-center gap-3 px-4 py-2" data-testid="upload-leftover">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm text-ink">{file.original_name}</p>
        <p className="mt-1 text-xs text-ink-2">{`Not finished · ${formatBytes(file.size)}`}</p>
      </div>
      <Button
        size="sm"
        variant="quiet"
        icon={Trash2}
        aria-label={`Remove ${file.original_name}`}
        loading={remove.isPending}
        onClick={() => {
          remove.mutate(file, {
            onError: (e) => {
              toast.show({ tone: 'error', message: `Not removed: ${messageOf(e)}` });
            },
          });
        }}
      >
        Remove
      </Button>
    </li>
  );
}

/** Queue lines alone (Stop, Retry, Remove), for an upload made outside Files (the permit stamp flow). */
export function UploadLines({ items }: { items: readonly UploadItem[] }) {
  const queue = useUploadQueue();
  return (
    <ul className="divide-y divide-line">
      {items.map((i) => (
        <UploadLine key={i.key} item={i} onStop={queue.cancel} onRetry={queue.retry} onRemove={queue.remove} />
      ))}
    </ul>
  );
}

interface UploadListProps {
  folderId: string;
  /** My unfinished uploads in this folder that the queue is not working on (features/files/leftovers). */
  leftovers?: readonly FileRow[] | undefined;
}

export function UploadList({ folderId, leftovers = [] }: UploadListProps) {
  const queue = useUploadQueue();
  const items = queue.items.filter((i) => i.folderId === folderId);
  if (items.length === 0 && leftovers.length === 0) return null;
  const finished = items.some((i) => i.status === 'done');
  return (
    <div className="border-b border-line">
      <ul className="divide-y divide-line">
        {leftovers.map((f) => (
          <LeftoverLine key={f.id} file={f} />
        ))}
        {items.map((i) => (
          <UploadLine key={i.key} item={i} onStop={queue.cancel} onRetry={queue.retry} onRemove={queue.remove} />
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
