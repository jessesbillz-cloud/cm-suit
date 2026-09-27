// One addendum. A draft edits in place (title, body, files; saved on blur with a version check) and has Issue.
// An issued one is read-only: it is a signed record.
import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { useAttachToAddendum, useSaveAddendum } from '../../data/bids.mutations';
import { useAddenda, useAddendumAcks, useBidInvites } from '../../data/bids.queries';
import type { AddendumRow } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { useFolders } from '../../data/queries';
import { ReadingPane } from '../../ui/ReadingPane';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { FileLine } from './FileLine';
import { IssueButton } from './IssueButton';
import { SaveState } from './SaveState';

const INPUT = 'rounded-md border border-line px-2.5 text-sm font-normal text-ink outline-none focus:border-accent';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';

function DraftAddendum({ row, specsFolderId }: { row: AddendumRow; specsFolderId: string | null }) {
  const save = useSaveAddendum();
  const attach = useAttachToAddendum();
  const toast = useToast();
  const [base, setBase] = useState(row);
  const [title, setTitle] = useState(row.title);
  const [body, setBody] = useState(row.body);
  const [problem, setProblem] = useState<string | null>(null);

  const onSaved = { onSuccess: (saved: AddendumRow) => {
      setBase(saved);
      setProblem(null);
    }, onError: (e: Error) => {
      setProblem(messageOf(e));
    } };

  function commitText() {
    if (title.trim() === base.title && body === base.body) return;
    if (title.trim() === '') {
      setProblem('Title is empty.');
      return;
    }
    save.mutate({ row: base, patch: { title: title.trim(), body } }, onSaved);
  }

  function remove(fileId: string) {
    const from = base;
    toast.show({
      message: 'Removing the file.',
      action: { label: 'Undo', onClick: () => undefined },
      onCommit: () => {
        save.mutate({ row: from, patch: { file_ids: from.file_ids.filter((id) => id !== fileId) } }, onSaved);
      },
    });
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="flex items-center gap-2 text-sm text-ink-2">
        <span className="tabular-nums">Addendum {base.number}</span>
        <StatusChip status="pending" label="Draft" />
      </p>
      <label className={LABEL}>
        Title
        <input className={`h-9 ${INPUT}`} value={title} onBlur={commitText} onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
      </label>
      <label className={LABEL}>
        Body
        <textarea rows={12} className={`py-2 ${INPUT}`} value={body} onBlur={commitText} onChange={(e) => {
            setBody(e.target.value);
          }}
        />
      </label>
      <ul className="flex flex-col gap-2">
        {base.file_ids.map((id) => (
          <FileLine key={id} fileId={id} onRemove={() => {
              remove(id);
            }}
          />
        ))}
      </ul>
      {specsFolderId !== null ? (
        <label className="inline-flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-md border border-line bg-card px-2.5 text-sm font-medium text-ink hover:bg-page">
          <Paperclip size={16} strokeWidth={1.75} aria-hidden="true" />
          {attach.isPending ? 'Attaching' : 'Attach'}
          <input
            type="file"
            className="sr-only"
            disabled={attach.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) attach.mutate({ row: base, folderId: specsFolderId, file }, onSaved);
            }}
          />
        </label>
      ) : null}
      <SaveState pending={save.isPending} saved={save.isSuccess} problem={problem} />
      <IssueButton row={base} disabled={save.isPending || attach.isPending} />
    </div>
  );
}

function IssuedAddendum({ row, acked, bidders }: { row: AddendumRow; acked: number; bidders: number }) {
  return (
    <ReadingPane
      number={String(row.number)}
      title={row.title}
      meta={<StatusChip status="confirmed" label={`Issued · ${String(acked)}/${String(bidders)}`} />}
    >
      <p className="whitespace-pre-wrap break-words">{row.body}</p>
      <ul className="mt-4 flex flex-col gap-2">
        {row.file_ids.map((id) => (
          <FileLine key={id} fileId={id} />
        ))}
      </ul>
    </ReadingPane>
  );
}

interface AddendumPaneProps {
  projectId: string;
  addendumId: string;
}

export function AddendumPane({ projectId, addendumId }: AddendumPaneProps) {
  const addenda = useAddenda(projectId);
  const acks = useAddendumAcks(projectId);
  const invites = useBidInvites(projectId);
  const folders = useFolders(projectId);

  if (addenda.isPending) return <LoadingState label="Loading addendum" />;
  if (addenda.isError) return <ErrorState error={addenda.error} onRetry={() => void addenda.refetch()} />;
  const row = addenda.data.find((a) => a.id === addendumId);
  if (!row) return <EmptyState title="That addendum is gone." />;
  if (row.issued_at === null) {
    const specs = folders.data?.find((f) => f.kind === 'specs')?.id ?? null;
    return <DraftAddendum row={row} specsFolderId={specs} />;
  }
  const acked = (acks.data ?? []).filter((a) => a.addendum_id === row.id).length;
  const bidders = new Set((invites.data ?? []).map((i) => i.member_id)).size;
  return <IssuedAddendum row={row} acked={acked} bidders={bidders} />;
}
