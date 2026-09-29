// The report's photos as a grid: each tile shows its place on the report, the time taken, the row it belongs to and a
// caption (saved on leaving the box), and on a company form an optional description (its "Photo Analysis" pages); remove
// with Undo. Upload progress and failed uploads (with Retry) come from the one upload queue. The Camera and Upload
// buttons sit in the header, or above the grid in Field Mode.
import { useState, type ReactNode } from 'react';
import { LoaderCircle, RotateCw, X } from 'lucide-react';
import { useDailyPhotoUploads, useRemoveDailyPhoto, useSaveDailyPhoto } from '../../data/dailies.mutations';
import type { DailyPhotoRow } from '../../data/dailies.types';
import { messageOf } from '../../data/errors';
import type { WorkRow } from '../../lib/dailies';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Thumb } from '../../ui/Thumb';
import { useToast } from '../../ui/Toast';
import { Section } from './Section';
import { INPUT } from './styles';

interface PhotoTileProps {
  projectId: string;
  photo: DailyPhotoRow;
  index: number;
  tz: string;
  rowLabel: string | null;
  locked: boolean;
  describe: boolean;
  onRemove: () => void;
}

function PhotoTile({ projectId, photo, index, tz, rowLabel, locked, describe, onRemove }: PhotoTileProps) {
  const save = useSaveDailyPhoto(projectId);
  const toast = useToast();
  const [caption, setCaption] = useState(photo.caption);
  const [description, setDescription] = useState(photo.description);
  const when = photo.taken_at ? formatInZone(photo.taken_at, tz, 'h:mm a') : '';
  const meta = [when, rowLabel].filter((x) => x !== null && x !== '').join(' · ');

  function saveText(what: string) {
    if (caption === photo.caption && description === photo.description) return;
    save.mutate(
      { photo, caption, ...(description === photo.description ? {} : { description }) },
      {
        onError: (e) => {
          toast.show({ tone: 'error', message: `${what} not saved: ${messageOf(e)}` });
        },
      },
    );
  }

  return (
    <li className="flex min-w-0 flex-col gap-2" data-testid="daily-photo">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
        <Thumb fileId={photo.file_id} alt={photo.caption || `Photo ${String(index + 1)}`} fill iconSize={28} />
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-black/10" />
        <span className="absolute left-2 top-2 rounded-md bg-card px-1.5 text-xs font-medium tabular-nums text-ink shadow-control">
          {index + 1}
        </span>
        {locked ? null : (
          <button
            type="button"
            aria-label={`Remove photo ${String(index + 1)}`}
            className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-card text-ink-2 shadow-control hover:text-danger"
            onClick={onRemove}
          >
            <Icon icon={X} size={16} />
          </button>
        )}
      </div>
      {meta !== '' ? <p className="break-words text-xs text-ink-2">{meta}</p> : null}
      <input
        aria-label={`Caption for photo ${String(index + 1)}`}
        placeholder="Caption"
        maxLength={500}
        className={`h-9 min-w-0 ${INPUT}`}
        value={caption}
        disabled={locked}
        onChange={(e) => {
          setCaption(e.target.value);
        }}
        onBlur={() => {
          saveText('Caption');
        }}
      />
      {describe ? (
        <textarea
          aria-label={`Description for photo ${String(index + 1)}`}
          placeholder="Description"
          rows={2}
          maxLength={4000}
          className={`min-w-0 py-1.5 ${INPUT}`}
          value={description}
          disabled={locked}
          data-testid="daily-photo-description"
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          onBlur={() => {
            saveText('Description');
          }}
        />
      ) : null}
    </li>
  );
}

interface PhotoListProps {
  projectId: string;
  photos: readonly DailyPhotoRow[];
  rows: readonly WorkRow[];
  tz: string;
  locked: boolean;
  /** Camera and Upload. */
  buttons: ReactNode;
  /** Field Mode: the big buttons go above the grid instead of in the header. */
  field: boolean;
  /** A company form: each photo takes an optional description. */
  describe: boolean;
}

export function PhotoList({ projectId, photos, rows, tz, locked, buttons, field, describe }: PhotoListProps) {
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

  const empty = live.length === 0 && sending === 0 && failed.length === 0;
  return (
    <Section title="Photos" count={live.length} actions={field ? undefined : buttons}>
      {field || !empty ? (
        <div className="flex flex-col gap-3">
          {field ? buttons : null}
          {sending > 0 ? (
            <p className="flex items-center gap-2 text-sm text-ink-2" data-testid="photos-uploading">
              <Icon icon={LoaderCircle} size={16} className="animate-spin text-accent" />
              Uploading {sending}
            </p>
          ) : null}
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
          {live.length > 0 ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-3 gap-y-4">
              {live.map((p, i) => (
                <PhotoTile
                  key={p.id}
                  projectId={projectId}
                  photo={p}
                  index={i}
                  tz={tz}
                  rowLabel={p.row_key ? (rowName.get(p.row_key) ?? null) : null}
                  locked={locked}
                  describe={describe}
                  onRemove={() => {
                    removeLater(p);
                  }}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}
