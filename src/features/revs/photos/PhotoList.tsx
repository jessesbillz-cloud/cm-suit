// Photos and notes of a wall, a room or a request (0102), newest first, as one strip: each photo a tile (ui/PhotoTile)
// that opens the one viewer over the strip (arrows between them, Download inside), a note alone as a box with its words.
// Under each: when and who, the wall (a room's or a request's list), the request it was added on (a tap opens it), the
// note. The X takes it off for the one who added it and the managers (Undo in the toast); a decided request's photos
// keep none.
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { downloadFile } from '../../../data/download';
import { messageOf } from '../../../data/errors';
import { saveIrFile } from '../../../data/inspections.mutations';
import { usePreviewFetch, type PreviewVia } from '../../../data/preview';
import { useSetRevPhoto, type RevPhoto } from '../../../data/revs.photos';
import { useFileViewer, type ViewerItem } from '../../../ui/FileViewer';
import { PhotoTile } from '../../../ui/PhotoTile';
import { Icon } from '../../../ui/Icon';
import { PHOTO_REMOVE } from '../../../ui/Thumb';
import { useToast } from '../../../ui/Toast';
import { photoRequest, photoWall, photoWhen } from './photoLines';

interface PhotoListProps {
  projectId: string;
  photos: readonly RevPhoto[];
  timeZone: string;
  /** The walls' names, when the list holds several walls (a room's, a request's). */
  wallNames?: ReadonlyMap<string, string> | undefined;
  /** Opens the request a photo was added on. */
  onOpenRequest?: ((requestId: string) => void) | undefined;
}

/** A note alone: its words in a box the size of a tile, taller when it needs. */
const NOTE_BOX = 'relative flex min-h-[8.5rem] w-full rounded-lg bg-page p-2.5 pr-9 ring-1 ring-black/10';

const via = (p: RevPhoto): PreviewVia | undefined => (p.via_request && p.request_id !== null ? { requestId: p.request_id } : undefined);

interface CaptionProps {
  photo: RevPhoto;
  timeZone: string;
  wallNames: ReadonlyMap<string, string> | null;
  onOpenRequest?: ((requestId: string) => void) | undefined;
}

function Caption({ photo, timeZone, wallNames, onOpenRequest }: CaptionProps) {
  const wall = photoWall(photo, wallNames);
  const ir = photoRequest(photo);
  const requestId = photo.request_id;
  let request: ReactNode = null;
  if (ir !== null && requestId !== null && onOpenRequest) {
    request = (
      <button
        type="button"
        className="font-medium text-accent"
        data-testid="rev-photo-request"
        onClick={() => {
          onOpenRequest(requestId);
        }}
      >
        {ir}
      </button>
    );
  } else if (ir !== null) {
    request = <span data-testid="rev-photo-request">{ir}</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 text-[12px] leading-4 text-ink-2">
      <span>{photoWhen(photo, timeZone)}</span>
      {wall !== null || request !== null ? (
        <span className="flex flex-wrap items-center gap-x-1.5">
          {wall !== null ? <span className="font-medium text-ink">{wall}</span> : null}
          {request}
        </span>
      ) : null}
      {photo.note !== null && photo.file_id !== null ? (
        <span className="break-words text-[13px] leading-5 text-ink" data-testid="rev-photo-note-text">
          {photo.note}
        </span>
      ) : null}
    </div>
  );
}

function viewerItem(p: RevPhoto & { file_id: string }, preview: (id: string, v?: PreviewVia) => Promise<string>): ViewerItem {
  const v = via(p);
  const name = p.file_name ?? 'Photo';
  return {
    id: p.file_id,
    name,
    kind: 'image',
    url: () => preview(p.file_id, v),
    download: () => (v !== undefined && p.request_id !== null ? saveIrFile(p.request_id, p.file_id) : downloadFile(p.file_id)),
  };
}

export function PhotoList({ projectId, photos, timeZone, wallNames, onOpenRequest }: PhotoListProps) {
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const set = useSetRevPhoto();
  const toast = useToast();
  const withFile = photos.filter((p): p is RevPhoto & { file_id: string } => p.file_id !== null);
  const items = withFile.map((p) => viewerItem(p, preview));
  const names = wallNames ?? null;

  function remove(photo: RevPhoto) {
    const failed = (e: unknown) => {
      toast.show({ tone: 'error', message: messageOf(e) });
    };
    set.mutate(
      { projectId, photo, back: false },
      {
        onError: failed,
        onSuccess: () => {
          toast.show({
            message: photo.file_id === null ? 'Note removed.' : 'Photo removed.',
            action: { label: 'Undo', onClick: () => { set.mutate({ projectId, photo, back: true }, { onError: failed }); } },
          });
        },
      },
    );
  }

  if (photos.length === 0) return null;
  return (
    <ul className="grid auto-cols-[8.5rem] grid-flow-col gap-3 overflow-x-auto pb-1" aria-label="Photos" data-testid="rev-photos">
      {photos.map((p) => {
        const caption = <Caption photo={p} timeZone={timeZone} wallNames={names} onOpenRequest={onOpenRequest} />;
        const onRemove = p.can_remove ? () => { remove(p); } : undefined;
        if (p.file_id === null) {
          return (
            <li key={p.id} className="flex flex-col gap-1" data-testid="rev-photo" data-kind="note">
              <div className={NOTE_BOX}>
                <span className="break-words text-[13px] leading-5 text-ink" data-testid="rev-photo-note-text">
                  {p.note}
                </span>
                {onRemove ? (
                  <button type="button" aria-label="Remove note" className={PHOTO_REMOVE} onClick={onRemove}>
                    <Icon icon={X} size={14} />
                  </button>
                ) : null}
              </div>
              {caption}
            </li>
          );
        }
        const at = items.findIndex((i) => i.id === p.file_id);
        return (
          <PhotoTile
            key={p.id}
            fileId={p.file_id}
            via={via(p)}
            name={p.file_name ?? 'Photo'}
            testId="rev-photo"
            onOpen={() => {
              viewer.open(items, Math.max(0, at));
            }}
            onRemove={onRemove}
            caption={caption}
          />
        );
      })}
    </ul>
  );
}
