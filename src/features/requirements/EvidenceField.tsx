// What shows it was done, as flexible as the job ("not every manufacturer sends a rep, sometimes they just take
// pictures"): a note and/or one file (a photo, a report, a letter), uploaded into the job's Requirements folder through
// the one uploader. The note saves when you leave the box; taking the file off has Undo. Readers see both. A company's
// own people add theirs on their own line (`own`, 0073): a file someone else attached is not theirs to take off, and a
// file I may not see shows as attached, with no download.
import { useRef, useState } from 'react';
import { Download, Paperclip, Upload, X } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { downloadEvidence, useRequirementEvidence, useRequirementsUpload } from '../../data/requirements.mutations';
import type { Requirement } from '../../data/requirements.types';
import { isAbortError } from '../../data/upload';
import { Button } from '../../ui/Button';
import { FIELD_AREA } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { SaveState } from '../../ui/SaveState';
import { useToast } from '../../ui/Toast';

type EvidenceRow = Pick<Requirement, 'id' | 'version' | 'evidence_note' | 'evidence_file_id' | 'evidence_file_name'>;

function FileLine({ row, onRemove }: { row: EvidenceRow; onRemove?: (() => void) | undefined }) {
  const toast = useToast();
  const fileId = row.evidence_file_id;
  if (fileId === null) return null;
  return (
    <span className="flex items-center gap-2 rounded-lg border border-line bg-card-head px-3 py-2 text-sm text-ink" data-testid="req-evidence-file">
      <Icon icon={Paperclip} size={16} className="shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1 break-words">{row.evidence_file_name ?? 'File'}</span>
      {row.evidence_file_name !== null ? (
        <Button
          size="sm"
          variant="quiet"
          icon={Download}
          aria-label="Download"
          onClick={() => {
            downloadEvidence(fileId).catch((e: unknown) => {
              toast.show({ message: messageOf(e), tone: 'error' });
            });
          }}
        />
      ) : null}
      {onRemove ? <Button size="sm" variant="quiet" icon={X} aria-label="Take the file off" onClick={onRemove} /> : null}
    </span>
  );
}

export function EvidenceView({ row }: { row: EvidenceRow }) {
  if (row.evidence_note === '' && row.evidence_file_id === null) return <p className="text-sm text-ink-3">None yet</p>;
  return (
    <div className="flex flex-col gap-2">
      {row.evidence_note !== '' ? <p className="whitespace-pre-wrap text-sm text-ink">{row.evidence_note}</p> : null}
      <FileLine row={row} />
    </div>
  );
}

interface EvidenceFieldProps {
  projectId: string;
  row: EvidenceRow;
  /** My company's own line (requirements.read_own), not the manager's write. */
  own: boolean;
}

export function EvidenceField({ projectId, row, own }: EvidenceFieldProps) {
  const save = useRequirementEvidence(projectId, own);
  const upload = useRequirementsUpload(projectId, own);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState(row.evidence_note);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // On my company's own line, only a file I may see (the one I added) is mine to take off.
  const removable = !own || row.evidence_file_name !== null;

  const write = (version: number, nextNote: string, fileId: string | null, undoFile?: string | null) => {
    setProblem(null);
    save.mutate(
      { id: row.id, version, note: nextNote, fileId },
      {
        onSuccess: (saved) => {
          if (undoFile === undefined) return;
          toast.show({
            message: 'File taken off',
            action: { label: 'Undo', onClick: () => { save.mutate({ id: row.id, version: saved.version, note: nextNote, fileId: undoFile }); } },
          });
        },
        onError: (e) => { setProblem(messageOf(e)); },
      },
    );
  };

  async function take(file: File) {
    setBusy(true);
    setProblem(null);
    try {
      const fileId = await upload(file, new AbortController().signal);
      write(row.version, note.trim(), fileId);
    } catch (e) {
      if (!isAbortError(e)) setProblem(messageOf(e));
      console.warn('requirement evidence upload failed', e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
          aria-label="Evidence note"
          placeholder="Note"
          className={FIELD_AREA}
          rows={2}
          maxLength={2000}
          value={note}
          data-testid="req-evidence-note"
          onChange={(e) => { setNote(e.target.value); }}
          onBlur={() => {
            if (note.trim() !== row.evidence_note) write(row.version, note.trim(), row.evidence_file_id);
          }}
        />
      {row.evidence_file_id !== null ? (
        <FileLine row={row} onRemove={removable ? () => { write(row.version, row.evidence_note, null, row.evidence_file_id); } : undefined} />
      ) : (
        <Button icon={Upload} loading={busy} className="self-start max-sm:h-11" data-testid="req-evidence-add" onClick={() => input.current?.click()}>
          Add file
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf,.pdf"
        className="hidden"
        data-testid="req-evidence-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void take(file);
        }}
      />
      <SaveState pending={save.isPending} saved={save.isSuccess} problem={problem} />
    </div>
  );
}
