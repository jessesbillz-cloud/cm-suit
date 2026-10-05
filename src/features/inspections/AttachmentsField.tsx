// Photos or PDFs on a request (or result photos): one button, uploaded right away through the one uploader (photos
// compressed first), with a progress bar and Stop while they go up. A new request's file taken off before sending
// leaves the job's request folder too (my own upload, soft-deleted). A request's result photos show as pictures
// (ui/Thumb, opened through the request); a new request's files as a list of names.
import { useRef } from 'react';
import { Paperclip, X } from 'lucide-react';
import { isAbortError } from '../../data/upload';
import { messageOf } from '../../data/errors';
import { useIrUpload, useRemoveIrUpload, type IrUpload } from '../../data/inspections.mutations';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { PHOTO_BOX, PHOTO_GRID, PHOTO_REMOVE, Thumb } from '../../ui/Thumb';
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
          {files.map((f) => (
            <li key={f.id} className={PHOTO_BOX} data-testid="ir-photo">
              <Thumb fileId={f.id} via={{ requestId }} alt={f.name} fill />
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                className={PHOTO_REMOVE}
                onClick={() => {
                  onChange(files.filter((x) => x.id !== f.id));
                }}
              >
                <Icon icon={X} size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {files.length > 0 && requestId === undefined ? (
        <ul className="flex flex-col gap-1" data-testid="ir-attach-list">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-md border border-line px-2 py-1 text-sm">
              <span className="min-w-0 flex-1 break-words">{f.name}</span>
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
