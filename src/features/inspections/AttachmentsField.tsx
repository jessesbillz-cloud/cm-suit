// Photos or PDFs on a request (or result photos): one button, uploaded right away through the one uploader
// (photos compressed first). Each file can be taken off again before saving. A request's result photos show as
// pictures (ui/Thumb, opened through the request); a new request's files as a list of names.
import { useRef } from 'react';
import { Paperclip, X } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useIrUpload, type IrUpload } from '../../data/inspections.mutations';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { PHOTO_BOX, PHOTO_GRID, PHOTO_REMOVE, Thumb } from '../../ui/Thumb';

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

export function AttachmentsField({ projectId, label, files, onChange, photosOnly = false, requestId, onBusy }: AttachmentsFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useIrUpload(projectId);

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
      {upload.isError ? <p className="text-sm text-danger">{messageOf(upload.error)}</p> : null}
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
        <ul className="flex flex-col gap-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-md border border-line px-2 py-1 text-sm">
              <span className="min-w-0 flex-1 break-words">{f.name}</span>
              <Button
                size="sm"
                variant="quiet"
                icon={X}
                aria-label={`Remove ${f.name}`}
                onClick={() => {
                  onChange(files.filter((x) => x.id !== f.id));
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
