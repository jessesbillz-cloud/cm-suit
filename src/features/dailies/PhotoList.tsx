// The report's photos: time taken, the row it belongs to, a caption (saved on leaving the box), remove with Undo.
// Upload progress and failed uploads (with Retry) come from the one upload queue.
import { useState } from 'react';
import { RotateCw, X } from 'lucide-react';
import { useDailyPhotoUploads, useRemoveDailyPhoto, useSaveDailyPhoto } from '../../data/dailies.mutations';
import type { DailyPhotoRow } from '../../data/dailies.types';
import { messageOf } from '../../data/errors';
import type { WorkRow } from '../../lib/dailies';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';

interface PhotoLineProps {
  projectId: string;
  photo: DailyPhotoRow;
  index: number;
  tz: string;
  rowLabel: string | null;
  locked: boolean;
  onRemove: () => void;
}

function PhotoLine({ projectId, photo, index, tz, rowLabel, locked, onRemove }: PhotoLineProps) {
  const save = useSaveDailyPhoto(projectId);
  const toast = useToast();
  const [caption, setCaption] = useState(photo.caption);
  const when = photo.taken_at ? formatInZone(photo.taken_at, tz, 'h:mm a') : '';

  return (
    <li className="flex items-center gap-2" data-testid="daily-photo">
      <span className="w-24 shrink-0 text-xs text-ink-2">
        Photo {index + 1}
        {when ? ` · ${when}` : ''}
        {rowLabel ? <span className="block break-words">{rowLabel}</span> : null}
      </span>
      <input
        aria-label={`Caption for photo ${String(index + 1)}`}
        placeholder="Caption"
        maxLength={500}
        className="h-9 min-w-0 flex-1 rounded-md border border-line bg-card px-2.5 text-sm text-ink outline-none focus:border-accent disabled:bg-page"
        value={caption}
        disabled={locked}
        onChange={(e) => {
          setCaption(e.target.value);
        }}
        onBlur={() => {
          if (caption === photo.caption) return;
          save.mutate(
            { photo, caption },
            {
              onError: (e) => {
                toast.show({ tone: 'error', message: `Caption not saved: ${messageOf(e)}` });
              },
            },
          );
        }}
      />
      {locked ? null : (
        <button
          type="button"
          aria-label={`Remove photo ${String(index + 1)}`}
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-page hover:text-ink"
          onClick={onRemove}
        >
          <Icon icon={X} size={18} />
        </button>
      )}
    </li>
  );
}

interface PhotoListProps {
  projectId: string;
  photos: readonly DailyPhotoRow[];
  rows: readonly WorkRow[];
  tz: string;
  locked: boolean;
}

export function PhotoList({ projectId, photos, rows, tz, locked }: PhotoListProps) {
  const remove = useRemoveDailyPhoto(projectId);
  const uploads = useDailyPhotoUploads(projectId);
  const toast = useToast();
  const [hidden, setHidden] = useState<string[]>([]);
  const live = photos.filter((p) => p.deleted_at === null && !hidden.includes(p.id));
  const rowName = new Map(rows.map((r) => [r.key, r.company.trim()]));
  const sending = uploads.items.filter((i) => i.status === 'queued' || i.status === 'uploading').length;
  const failed = uploads.items.filter((i) => i.status === 'failed');

  function removeLater(photo: DailyPhotoRow) {
    setHidden((h) => [...h, photo.id]);
    toast.show({
      message: 'Photo removed.',
      action: {
        label: 'Undo',
        onClick: () => {
          setHidden((h) => h.filter((id) => id !== photo.id));
        },
      },
      // Runs when the toast closes, maybe after this screen is gone: the promise reports a failure.
      onCommit: () => {
        remove.mutateAsync(photo).catch((e: unknown) => {
          setHidden((h) => h.filter((id) => id !== photo.id));
          toast.show({ tone: 'error', message: `Photo not removed: ${messageOf(e)}` });
        });
      },
    });
  }

  if (live.length === 0 && sending === 0 && failed.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">Photos</h3>
      {sending > 0 ? <p className="text-sm text-ink-2" data-testid="photos-uploading">Uploading {sending}</p> : null}
      {failed.map((f) => (
        <p key={f.key} role="alert" className="flex items-center gap-2 text-sm text-danger">
          <span className="min-w-0 flex-1 break-words">
            {f.name}: {f.error ?? 'Upload failed'}
          </span>
          <Button
            size="sm"
            icon={RotateCw}
            onClick={() => {
              uploads.retry(f.key);
            }}
          >
            Retry
          </Button>
        </p>
      ))}
      <ul className="flex flex-col gap-2">
        {live.map((p, i) => (
          <PhotoLine
            key={p.id}
            projectId={projectId}
            photo={p}
            index={i}
            tz={tz}
            rowLabel={p.row_key ? (rowName.get(p.row_key) ?? null) : null}
            locked={locked}
            onRemove={() => {
              removeLater(p);
            }}
          />
        ))}
      </ul>
    </section>
  );
}
