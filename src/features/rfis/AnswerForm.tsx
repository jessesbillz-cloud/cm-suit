// The architect answers in the app: the answer, and files if they help (a sketch, a marked-up sheet). Files upload at
// once through the one uploader (photos compressed first) into the job's RFIs folder.
import { useRef, useState } from 'react';
import { LoaderCircle, Paperclip, Send, X } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useAnswerRfi, useRfiUpload } from '../../data/rfis.mutations';
import type { RfiRow } from '../../data/rfis.types';
import { compressPhoto, jpegName } from '../../lib/compressPhoto';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { NoteField } from './NoteForm';

interface Picked {
  key: number;
  name: string;
  fileId: string | null;
  error: string | null;
}

async function prepare(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  return new File([await compressPhoto(file)], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
}

interface AnswerFormProps {
  row: RfiRow;
  onDone: () => void;
}

export function AnswerForm({ row, onDone }: AnswerFormProps) {
  const answer = useAnswerRfi();
  const upload = useRfiUpload();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const nextKey = useRef(1);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Picked[]>([]);

  function add(list: FileList | null) {
    for (const file of list ? Array.from(list) : []) {
      const key = nextKey.current;
      nextKey.current += 1;
      setFiles((f) => [...f, { key, name: file.name, fileId: null, error: null }]);
      // Uploads finish even if the form closes: a file is never half-stored.
      void prepare(file)
        .then((ready) => upload(row.project_id, ready, new AbortController().signal))
        .then(
          (fileId) => {
            setFiles((f) => f.map((x) => (x.key === key ? { ...x, fileId } : x)));
          },
          (e: unknown) => {
            setFiles((f) => f.map((x) => (x.key === key ? { ...x, error: messageOf(e) } : x)));
          },
        );
    }
  }

  const busy = files.some((f) => f.fileId === null && f.error === null);
  const failed = files.some((f) => f.error !== null);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3.5" data-testid="rfi-answer-form">
      <NoteField label="Answer" value={text} onChange={setText} testId="rfi-answer-text" rows={6} autoFocus />
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="image/*,application/pdf"
        data-testid="rfi-answer-files"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = '';
        }}
      />
      {files.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {files.map((f) => (
            <li key={f.key} className="flex items-center gap-2 rounded-lg border border-line py-1 pl-3 pr-1 text-sm">
              {f.fileId === null && f.error === null ? <Icon icon={LoaderCircle} size={14} className="animate-spin text-ink-2" /> : null}
              <span className={`min-w-0 flex-1 break-words ${f.error ? 'text-danger' : 'text-ink'}`}>{f.error ? `${f.name}: ${f.error}` : f.name}</span>
              <Button
                size="sm"
                variant="quiet"
                icon={X}
                aria-label={`Remove ${f.name}`}
                onClick={() => {
                  setFiles((all) => all.filter((x) => x.key !== f.key));
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {answer.isError ? <p className="text-sm text-danger">{messageOf(answer.error)}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="quiet"
          icon={Paperclip}
          className="mr-auto"
          onClick={() => {
            input.current?.click();
          }}
        >
          Attach
        </Button>
        <Button variant="quiet" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="primary"
          icon={Send}
          loading={answer.isPending}
          disabled={text.trim() === '' || busy || failed}
          data-testid="rfi-answer-send"
          onClick={() => {
            const fileIds = files.flatMap((f) => (f.fileId === null ? [] : [f.fileId]));
            answer.mutate(
              { ref: row, answer: text, fileIds },
              {
                onSuccess: () => {
                  toast.show({ message: 'Answer sent' });
                  onDone();
                },
              },
            );
          }}
        >
          Send answer
        </Button>
      </div>
    </div>
  );
}
