// Photos or PDFs on a request (or result photos): one button, uploaded right away through the one uploader
// (photos compressed first). Each file can be taken off again before saving.
import { useRef } from 'react';
import { Paperclip, X } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useIrUpload, type IrUpload } from '../../data/inspections.mutations';
import { Button } from '../../ui/Button';

interface AttachmentsFieldProps {
  projectId: string;
  label: string;
  files: readonly IrUpload[];
  onChange: (files: IrUpload[]) => void;
  /** Result photos take images only. */
  photosOnly?: boolean | undefined;
  onBusy?: ((busy: boolean) => void) | undefined;
}

export function AttachmentsField({ projectId, label, files, onChange, photosOnly = false, onBusy }: AttachmentsFieldProps) {
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
      {files.length > 0 ? (
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
