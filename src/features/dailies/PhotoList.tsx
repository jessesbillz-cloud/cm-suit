// The report's photos as a grid: each tile shows its place on the report, the time taken, the row it belongs to and a
// caption (saved on leaving the box); on a company form that box is the photo's Title, with an optional Description
// under it (the PDF's "Photo Analysis" pages print the title over the description, beside the photo); a tap
// on the picture opens the file viewer over all the report's photos (Download inside, and Delete while the report can
// change); remove with Undo (usePhotoRemovals, owned by the editor so Submit can flush it), on the tile or in the viewer.
// Upload progress and failed uploads (with Retry) come from the one upload queue. The count shows against the 40 a report
// holds. The Camera and Upload buttons sit in the header, or above the grid in Field Mode.
import { useState, type ReactNode } from 'react';
import { LoaderCircle, RotateCw, X } from 'lucide-react';
import { useDailyPhotoUploads, useSaveDailyPhoto } from '../../data/dailies.mutations';
import type { DailyPhotoRow } from '../../data/dailies.types';
import { downloadFile } from '../../data/download';
import { messageOf } from '../../data/errors';
import { usePreviewFetch } from '../../data/preview';
import { PHOTOS_PER_REPORT_MAX, type WorkRow } from '../../lib/dailies';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { useFileViewer, type ViewerItem } from '../../ui/FileViewer';
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
  onView: () => void;
  onRemove: () => void;
}

/** What a photo is called: its caption, or its place on the report. */
function photoName(photo: DailyPhotoRow, index: number): string {
  return photo.caption.trim() || `Photo ${String(index + 1)}`;
}

function PhotoTile({ projectId, photo, index, tz, rowLabel, locked, describe, onView, onRemove }: PhotoTileProps) {
  const save = useSaveDailyPhoto(projectId);
  const toast = useToast();
  const [caption, setCaption] = useState(photo.caption);
  const [description, setDescription] = useState(photo.description);
  const when = photo.taken_at ? formatInZone(photo.taken_at, tz, 'h:mm a') : '';
  // A company form prints it as the title over the description (Photo Analysis); the work log, as the caption.
  const captionWord = describe ? 'Title' : 'Caption';
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
        <button
          type="button"
          data-testid="daily-photo-view"
          aria-label={`View photo ${String(index + 1)}`}
          className="absolute inset-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={onView}
        >
          <Thumb fileId={photo.file_id} alt={photoName(photo, index)} fill iconSize={28} />
        </button>
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-black/10" />
        <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-card px-1.5 text-xs font-medium tabular-nums text-ink shadow-control">
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
        aria-label={`${captionWord} for photo ${String(index + 1)}`}
        placeholder={captionWord}
        maxLength={500}
        className={`h-9 min-w-0 ${INPUT}`}
        value={caption}
        disabled={locked}
        onChange={(e) => {
          setCaption(e.target.value);
        }}
        onBlur={() => {
          saveText(captionWord);
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
  /** Photos removed a moment ago (their Undo still open): not shown. */
  hidden: readonly string[];
  onRemove: (photo: DailyPhotoRow) => void;
}

export function PhotoList({ projectId, photos, rows, tz, locked, buttons, field, describe, hidden, onRemove }: PhotoListProps) {
  const uploads = useDailyPhotoUploads(projectId);
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const live = photos.filter((p) => p.deleted_at === null && !hidden.includes(p.id));
  // The viewer walks every photo on the report; Delete there is the tile's remove, with the same Undo.
  const items: ViewerItem[] = live.map((p, i) => ({
    id: p.id,
    name: photoName(p, i),
    kind: 'image',
    url: () => preview(p.file_id),
    download: () => downloadFile(p.file_id),
    remove: locked
      ? undefined
      : () => {
          onRemove(p);
        },
  }));
  const rowName = new Map(rows.map((r) => [r.key, r.company.trim()]));
  const sending = uploads.items.filter((i) => i.status === 'queued' || i.status === 'uploading').length;
  const failed = uploads.items.filter((i) => i.status === 'failed');
  const full = live.length >= PHOTOS_PER_REPORT_MAX;

  const empty = live.length === 0 && sending === 0 && failed.length === 0;
  return (
    <Section title="Photos" count={live.length} limit={PHOTOS_PER_REPORT_MAX} actions={field ? undefined : buttons} testId="daily-photos">
      {field || !empty ? (
        <div className="flex flex-col gap-3">
          {field ? buttons : null}
          {full && !locked ? (
            <p className="text-sm text-ink-2" data-testid="photos-full">
              {PHOTOS_PER_REPORT_MAX} photos, the most a report holds.
            </p>
          ) : null}
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
                  onView={() => {
                    viewer.open(items, i);
                  }}
                  onRemove={() => {
                    onRemove(p);
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
