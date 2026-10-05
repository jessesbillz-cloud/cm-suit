// One addendum. A draft edits in place (title, body; saved on blur with a version check), takes files through the one
// upload queue into the job's Addenda folder (bidders see them only once it is issued), is discarded with Undo, and
// has Issue. An issued one is read-only (a signed record) and lists who has and hasn't acknowledged it.
import { useState } from 'react';
import { Paperclip, Trash2 } from 'lucide-react';
import { useAddendaFolder, useAttachToAddendum, useDiscardAddendum, useSaveAddendum } from '../../data/addenda';
import { useAddenda, useAddendumAcks, useBidInvites } from '../../data/bids.queries';
import type { AddendumRow } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { usePeopleDisplay, useProject } from '../../data/queries';
import { Button } from '../../ui/Button';
import { ReadingPane } from '../../ui/ReadingPane';
import { SaveState } from '../../ui/SaveState';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { UploadList } from '../files/UploadList';
import { AckList } from './AckList';
import { FileLine } from './FileLine';
import { IssueButton } from './IssueButton';
import { useBidsNav } from './useBidsNav';

const INPUT = 'rounded-md border border-line px-2.5 text-sm font-normal text-ink outline-none focus:border-accent';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';

function DraftAddendum({ row }: { row: AddendumRow }) {
  const save = useSaveAddendum();
  const attach = useAttachToAddendum();
  const discard = useDiscardAddendum();
  const folder = useAddendaFolder(row.project_id, true);
  const nav = useBidsNav(row.project_id);
  const toast = useToast();
  const [title, setTitle] = useState(row.title);
  const [body, setBody] = useState(row.body);
  const [problem, setProblem] = useState<string | null>(null);

  const onSaved = {
    onSuccess: () => {
      setProblem(null);
    },
    onError: (e: Error) => {
      setProblem(messageOf(e));
    },
  };

  function commitText() {
    if (title.trim() === row.title && body === row.body) return;
    if (title.trim() === '') {
      setProblem('Title is empty.');
      return;
    }
    save.mutate({ row, patch: { title: title.trim(), body } }, onSaved);
  }

  function remove(fileId: string) {
    toast.show({
      message: 'Removing the file.',
      action: { label: 'Undo', onClick: () => undefined },
      onCommit: () => {
        save.mutate({ row, patch: { file_ids: row.file_ids.filter((id) => id !== fileId) } }, onSaved);
      },
    });
  }

  function discardDraft() {
    discard.mutateAsync({ row, version: row.version, discarded: true }).then(
      (version) => {
        nav.setView('addenda');
        toast.show({
          message: `Addendum ${String(row.number)} discarded.`,
          action: {
            label: 'Undo',
            onClick: () => {
              discard.mutateAsync({ row, version, discarded: false }).catch((e: unknown) => {
                toast.show({ tone: 'error', message: `Not brought back: ${messageOf(e)}` });
              });
            },
          },
        });
      },
      (e: unknown) => {
        toast.show({ tone: 'error', message: `Not discarded: ${messageOf(e)}` });
      },
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 text-sm text-ink-2">
        <span className="tabular-nums">Addendum {row.number}</span>
        <StatusChip status="pending" label="Draft" />
        <span className="flex-1" />
        <Button size="sm" variant="quiet" icon={Trash2} data-testid="addendum-discard" loading={discard.isPending} onClick={discardDraft}>
          Discard
        </Button>
      </div>
      <label className={LABEL}>
        Title
        <input className={`h-9 ${INPUT}`} value={title} data-testid="addendum-title" onBlur={commitText} onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
      </label>
      <label className={LABEL}>
        Body
        <textarea rows={12} className={`py-2 ${INPUT}`} value={body} data-testid="addendum-body" onBlur={commitText} onChange={(e) => {
            setBody(e.target.value);
          }}
        />
      </label>
      <ul className="flex flex-col gap-2">
        {row.file_ids.map((id) => (
          <FileLine key={id} fileId={id} onRemove={() => {
              remove(id);
            }}
          />
        ))}
      </ul>
      {folder.data !== undefined ? <UploadList folderId={folder.data} /> : null}
      {folder.isError ? <p className="text-sm text-danger">{messageOf(folder.error)}</p> : null}
      {folder.data !== undefined ? (
        <label className="inline-flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-md border border-line bg-card px-2.5 text-sm font-medium text-ink hover:bg-page">
          <Paperclip size={16} strokeWidth={1.75} aria-hidden="true" />
          Attach
          <input
            type="file"
            multiple
            className="sr-only"
            data-testid="addendum-attach-input"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length > 0 && folder.data !== undefined) attach(row, folder.data, files);
            }}
          />
        </label>
      ) : null}
      <SaveState pending={save.isPending} saved={save.isSuccess} problem={problem} />
      <IssueButton row={row} disabled={save.isPending} />
    </div>
  );
}

function IssuedAddendum({ row }: { row: AddendumRow }) {
  const acks = useAddendumAcks(row.project_id);
  const invites = useBidInvites(row.project_id);
  const people = usePeopleDisplay(row.project_id);
  const project = useProject(row.project_id);
  return (
    <ReadingPane number={String(row.number)} title={row.title} meta={<StatusChip status="confirmed" label="Issued" />}>
      <p className="whitespace-pre-wrap break-words">{row.body}</p>
      <ul className="my-4 flex flex-col gap-2">
        {row.file_ids.map((id) => (
          <FileLine key={id} fileId={id} />
        ))}
      </ul>
      {acks.isError ? <ErrorState error={acks.error} onRetry={() => void acks.refetch()} /> : null}
      {invites.isError ? <ErrorState error={invites.error} onRetry={() => void invites.refetch()} /> : null}
      {acks.data && invites.data && project.data ? (
        <AckList addendumId={row.id} acks={acks.data} invites={invites.data} people={people.data ?? []} tz={project.data.timezone} />
      ) : null}
    </ReadingPane>
  );
}

interface AddendumPaneProps {
  projectId: string;
  addendumId: string;
}

export function AddendumPane({ projectId, addendumId }: AddendumPaneProps) {
  const addenda = useAddenda(projectId);

  if (addenda.isPending) return <LoadingState label="Loading addendum" />;
  if (addenda.isError) return <ErrorState error={addenda.error} onRetry={() => void addenda.refetch()} />;
  const row = addenda.data.find((a) => a.id === addendumId);
  if (!row) return <EmptyState title="That addendum is gone." />;
  return row.issued_at === null ? <DraftAddendum key={row.id} row={row} /> : <IssuedAddendum row={row} />;
}
