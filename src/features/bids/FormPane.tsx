// One bid form on the right: To do / Done / N/A, the attached file (attach, view, download, take off), the due day and a
// note. Every change saves at once with a version check; taking a file off and removing the form have Undo.
import { useState } from 'react';
import { Paperclip, Trash2 } from 'lucide-react';
import { FORM_STATUSES, useAttachBidForm, useBidForms, useSaveBidForm, type BidFormItem, type FormPatch } from '../../data/bidForms';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { ReadingPane } from '../../ui/ReadingPane';
import { SaveState } from '../../ui/SaveState';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { FileLines } from './FileLine';
import { STATUS_LABELS } from './forms';
import { useBidsNav } from './useBidsNav';

const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';
const INPUT = 'rounded-md border border-line-strong px-2.5 py-2 text-sm font-normal text-ink shadow-control outline-none focus:border-accent';

interface FormBodyProps {
  row: BidFormItem;
  folderId: string;
  onClosed: () => void;
}

function FormBody({ row, folderId, onClosed }: FormBodyProps) {
  const save = useSaveBidForm();
  const attach = useAttachBidForm();
  const toast = useToast();
  const [due, setDue] = useState(row.due_on ?? '');
  const [note, setNote] = useState(row.note);
  const [problem, setProblem] = useState<string | null>(null);
  const busy = save.isPending || attach.isPending;

  const handlers = {
    onSuccess: () => {
      setProblem(null);
    },
    onError: (e: Error) => {
      setProblem(messageOf(e));
    },
  };

  function patch(p: FormPatch) {
    save.mutate({ row, patch: p }, handlers);
  }

  /**
   * Saves now and offers Undo, which puts the old value back on the saved row. Promise-based on purpose: a removed
   * form leaves the list at once, which unmounts this pane before per-call callbacks would run.
   */
  function patchWithUndo(p: FormPatch, back: FormPatch, message: string, after?: () => void) {
    save.mutateAsync({ row, patch: p }).then(
      (saved) => {
        after?.();
        toast.show({
          message,
          action: {
            label: 'Undo',
            onClick: () => {
              save.mutateAsync({ row: saved, patch: back }).catch((e: unknown) => {
                toast.show({ tone: 'error', message: `Not undone: ${messageOf(e)}` });
              });
            },
          },
        });
      },
      (e: unknown) => {
        toast.show({ tone: 'error', message: `Not saved: ${messageOf(e)}` });
      },
    );
  }

  return (
    <ReadingPane
      title={row.name}
      meta={row.reference !== '' ? row.reference : undefined}
      actions={
        <Button variant="quiet" icon={Trash2} disabled={busy} data-testid="form-remove" onClick={() => {
            patchWithUndo({ removed: true }, { removed: false }, `${row.name} removed.`, onClosed);
          }}
        >
          Remove
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="group" aria-label="Status" className="inline-flex w-fit rounded-md border border-line bg-card p-0.5">
          {FORM_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={row.status === s}
              data-testid={`form-status-${s}`}
              disabled={busy}
              className={`h-8 min-w-16 rounded px-3 text-sm ${row.status === s ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:text-ink'}`}
              onClick={() => {
                if (row.status !== s) patch({ status: s });
              }}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {row.file_id !== null ? (
            <FileLines
              ids={[row.file_id]}
              onRemove={() => {
                patchWithUndo({ file_id: null }, { file_id: row.file_id }, 'File taken off.');
              }}
            />
          ) : null}
          <label className="inline-flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-card px-2.5 text-sm font-medium text-ink shadow-control hover:bg-page">
            <Icon icon={Paperclip} size={16} />
            {attach.isPending ? 'Attaching' : row.file_id !== null ? 'Replace' : 'Attach'}
            <input
              type="file"
              className="sr-only"
              data-testid="form-attach-input"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) attach.mutate({ row, folderId, file }, handlers);
              }}
            />
          </label>
        </div>

        <TextField
          label="Due"
          type="date"
          value={due}
          testId="form-due"
          className="w-44"
          onChange={setDue}
          onBlur={() => {
            if (due !== (row.due_on ?? '')) patch({ due_on: due === '' ? null : due });
          }}
        />

        <label className={LABEL}>
          Note
          <textarea
            rows={4}
            className={INPUT}
            value={note}
            data-testid="form-note"
            onChange={(e) => {
              setNote(e.target.value);
            }}
            onBlur={() => {
              if (note !== row.note) patch({ note });
            }}
          />
        </label>

        <SaveState pending={busy} saved={save.isSuccess || attach.isSuccess} problem={problem} />
      </div>
    </ReadingPane>
  );
}

interface FormPaneProps {
  projectId: string;
  itemId: string;
}

export function FormPane({ projectId, itemId }: FormPaneProps) {
  const forms = useBidForms(projectId);
  const nav = useBidsNav(projectId);
  if (forms.isPending) return <LoadingState label="Loading form" />;
  if (forms.isError) return <ErrorState error={forms.error} onRetry={() => void forms.refetch()} />;
  const row = forms.data.items.find((i) => i.id === itemId);
  if (!row) return <EmptyState title="That form is gone." />;
  return (
    <FormBody
      row={row}
      folderId={forms.data.folderId}
      onClosed={() => {
        nav.setView('forms');
      }}
    />
  );
}
