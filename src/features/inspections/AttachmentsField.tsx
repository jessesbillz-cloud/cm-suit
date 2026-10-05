// Photos or PDFs on a request (or result photos): one button, uploaded right away through the one uploader (photos
// compressed first), with a progress bar and Stop while they go up. A new request's file taken off before sending
// leaves the job's request folder too (my own upload, soft-deleted). A request's result photos show as pictures
// (opened through the request); a new request's files as a list of names. A tap on either opens the file viewer over
// the list (Download and Remove inside); a result photo taken off comes back with Undo.
import { useEffect, useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { downloadErrorMessage, downloadFile } from '../../data/download';
import { isAbortError } from '../../data/upload';
import { messageOf } from '../../data/errors';
import { saveIrFile, useIrUpload, useRemoveIrUpload, type IrUpload } from '../../data/inspections.mutations';
import { usePreviewFetch } from '../../data/preview';
import { fileKind } from '../../lib/fileKind';
import { Button } from '../../ui/Button';
import { useFileViewer, type ViewerItem } from '../../ui/FileViewer';
import { PhotoTile } from '../../ui/PhotoTile';
import { PHOTO_GRID } from '../../ui/Thumb';
import { useToast } from '../../ui/Toast';

interface AttachmentsFieldProps {
  projectId: string;
  label: string;
  files: readonly IrUpload[];
  onChange: (files: IrUpload[]) => void;
  /** Result photos take images only. */
  photosOnly?: boolean | undefined;
  /** The saved request these photos are on: they show as pictures, opened through it. */
  requestId?: string | undefined;
  onBusy?: ((busy: boolean) => void) | undefined;
}

function Progress({ value, onStop }: { value: number; onStop: () => void }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2" data-testid="ir-attach-progress">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-page" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${String(pct)}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-ink-2">{pct}%</span>
      <Button size="sm" variant="quiet" icon={X} onClick={onStop}>
        Stop
      </Button>
    </div>
  );
}

export function AttachmentsField({ projectId, label, files, onChange, photosOnly = false, requestId, onBusy }: AttachmentsFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, progress, stop } = useIrUpload(projectId);
  const removeUpload = useRemoveIrUpload();
  const toast = useToast();
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const [saving, setSaving] = useState<string | null>(null);
  // Undo runs after later saves: it goes through the newest onChange (a saved request's carries the newest version).
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });

  function picked(list: FileList | null) {
    const chosen = list ? Array.from(list) : [];
    if (chosen.length === 0) return;
    onBusy?.(true);
    upload.mutate(chosen, {
      onSuccess: (added) => {
        onChange([...files, ...added]);
      },
      onSettled: () => {
        onBusy?.(false);
        if (input.current) input.current.value = '';
      },
    });
  }

  /** A new request's file: off the form and out of the folder. */
  function takeOff(f: IrUpload) {
    removeUpload.mutate(f.id, {
      onSuccess: () => {
        onChange(files.filter((x) => x.id !== f.id));
      },
      onError: (e) => {
        toast.show({ tone: 'error', message: `Not removed: ${messageOf(e)}` });
      },
    });
  }

  /** A result photo: off the request (the file stays in the folder), with Undo. */
  function unlink(f: IrUpload) {
    onChange(files.filter((x) => x.id !== f.id));
    toast.show({ message: 'Photo removed', action: { label: 'Undo', onClick: () => { latest.current([...files]); } } });
  }

  // A saved request's files open through the request's gate; a new request's are my own uploads, in their folder.
  const items: ViewerItem[] = files.map((f) => ({
    id: f.id,
    name: f.name,
    kind: photosOnly ? 'image' : fileKind(f.name),
    url: () => preview(f.id, requestId === undefined ? undefined : { requestId }),
    download: () => (requestId === undefined ? downloadFile(f.id) : saveIrFile(requestId, f.id)),
    remove: () => {
      if (requestId === undefined) takeOff(f);
      else unlink(f);
    },
  }));

  function save(item: ViewerItem) {
    setSaving(item.id);
    item
      .download()
      .catch((e: unknown) => {
        toast.show({ tone: 'error', message: downloadErrorMessage(e) });
      })
      .finally(() => {
        setSaving(null);
      });
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={photosOnly ? 'image/*' : 'image/*,application/pdf'}
        data-testid="ir-attach-input"
        onChange={(e) => {
          picked(e.target.files);
        }}
      />
      <div>
        <Button
          size="sm"
          icon={Paperclip}
          loading={upload.isPending}
          onClick={() => {
            input.current?.click();
          }}
        >
          {label}
        </Button>
      </div>
      {progress !== null ? <Progress value={progress} onStop={stop} /> : null}
      {upload.isError && !isAbortError(upload.error) ? <p className="text-sm text-danger">{messageOf(upload.error)}</p> : null}
      {files.length > 0 && requestId !== undefined ? (
        <ul className={PHOTO_GRID} aria-label={label}>
          {files.map((f, i) => (
            <PhotoTile
              key={f.id}
              fileId={f.id}
              via={{ requestId }}
              name={f.name}
              testId="ir-photo"
              onOpen={() => {
                viewer.open(items, i);
              }}
              downloading={saving === f.id}
              onDownload={() => {
                const item = items[i];
                if (item) save(item);
              }}
              onRemove={() => {
                unlink(f);
              }}
            />
          ))}
        </ul>
      ) : null}
      {files.length > 0 && requestId === undefined ? (
        <ul className="flex flex-col gap-1" data-testid="ir-attach-list">
          {files.map((f, i) => (
            <li key={f.id} className="flex items-center gap-2 rounded-md border border-line px-2 py-1 text-sm">
              <button
                type="button"
                className="min-h-8 min-w-0 flex-1 break-words text-left hover:text-accent"
                data-testid="ir-attach-open"
                onClick={() => {
                  viewer.open(items, i);
                }}
              >
                {f.name}
              </button>
              <Button
                size="sm"
                variant="quiet"
                icon={X}
                aria-label={`Remove ${f.name}`}
                loading={removeUpload.isPending && removeUpload.variables === f.id}
                onClick={() => {
                  takeOff(f);
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
