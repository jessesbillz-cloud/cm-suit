// Send results: the ONE results email. The picker starts with the requester and the job team checked; a person
// presses Send. Afterwards each address shows how it went, with the mail-app and copy fallbacks.
import { useState } from 'react';
import { Copy, Mail, Send } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useSendResults } from '../../data/inspections.decide';
import { useIrRecipients } from '../../data/inspections.queries';
import type { IrRecipient, IrRequest, IrSendResult } from '../../data/inspections.types';
import { Button } from '../../ui/Button';
import { CheckField } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';

interface PickerProps {
  row: IrRequest;
  people: readonly IrRecipient[];
  onSent: (r: IrSendResult) => void;
}

function Picker({ row, people, onSent }: PickerProps) {
  const send = useSendResults();
  const [picked, setPicked] = useState(() => new Set(people.filter((p) => p.preselect).map((p) => p.member_id)));
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-page/40 p-3" data-testid="ir-send-picker">
      {people.map((p) => (
        <CheckField
          key={p.member_id}
          label={p.company ? `${p.full_name} · ${p.company}` : p.full_name}
          checked={picked.has(p.member_id)}
          onChange={(on) => {
            const next = new Set(picked);
            if (on) next.add(p.member_id);
            else next.delete(p.member_id);
            setPicked(next);
          }}
        />
      ))}
      {send.isError ? <p className="text-sm text-danger">{messageOf(send.error)}</p> : null}
      <div className="flex justify-end">
        <Button
          variant="primary"
          icon={Send}
          disabled={picked.size === 0}
          loading={send.isPending}
          onClick={() => {
            send.mutate({ row, memberIds: [...picked] }, { onSuccess: onSent });
          }}
        >
          Send
        </Button>
      </div>
    </div>
  );
}

function Sent({ result }: { result: IrSendResult }) {
  const toast = useToast();
  return (
    <div className="flex flex-col gap-1 text-sm" data-testid="ir-sent">
      {result.deliveries.map((d) => (
        <p key={d.email} className={d.status === 'failed' || d.status === 'suppressed' ? 'text-danger' : 'text-ink'}>
          {d.email} · {d.status === 'failed' || d.status === 'suppressed' ? `Not sent${d.error ? `: ${d.error}` : ''}` : 'Sent'}
        </p>
      ))}
      <div className="flex gap-2">
        <a href={result.mailto} className="inline-flex items-center gap-1 text-accent hover:underline">
          <Icon icon={Mail} size={14} /> Open in my mail app
        </a>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-accent hover:underline"
          onClick={() => {
            navigator.clipboard.writeText(result.recipients.join(', ')).then(
              () => {
                toast.show({ message: 'Recipients copied.' });
              },
              (e: unknown) => {
                toast.show({ tone: 'error', message: `Not copied: ${messageOf(e)}` });
              },
            );
          }}
        >
          <Icon icon={Copy} size={14} /> Copy recipients
        </button>
      </div>
    </div>
  );
}

export function SendStep({ row }: { row: IrRequest }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<IrSendResult | null>(null);
  const people = useIrRecipients(row.project_id, open ? row.id : null);
  if (row.status !== 'complete' || row.ir_file_id === null || row.pdf_stale) return null;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant={open || row.results_sent_at !== null ? 'secondary' : 'primary'}
          icon={Send}
          onClick={() => {
            setOpen(!open);
            setResult(null);
          }}
        >
          Send results
        </Button>
      </div>
      {open && result === null ? (
        <>
          {people.isPending ? <LoadingState label="Loading people" /> : null}
          {people.isError ? <ErrorState error={people.error} onRetry={() => void people.refetch()} /> : null}
          {people.data ? <Picker row={row} people={people.data} onSent={setResult} /> : null}
        </>
      ) : null}
      {result ? <Sent result={result} /> : null}
    </div>
  );
}
