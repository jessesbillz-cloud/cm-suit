// Send results: the ONE results email. The picker starts with the requester (a member, or the visitor who asked through
// the link: their name and email from the request) and the job team checked; an address can be typed in (MDR's add an
// address). Nothing goes until a person presses Send. Afterwards each address shows how it went, with the mail-app and
// copy fallbacks.
import { useState } from 'react';
import { Copy, Mail, Plus, Send } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useSendResults } from '../../data/inspections.decide';
import { useIrRecipients } from '../../data/inspections.queries';
import type { IrRecipient, IrRequest, IrSendResult } from '../../data/inspections.types';
import { Button } from '../../ui/Button';
import { CheckField, TextField } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface PickerProps {
  row: IrRequest;
  people: readonly IrRecipient[];
  onSent: (r: IrSendResult) => void;
}

function toggled(set: ReadonlySet<string>, key: string, on: boolean): Set<string> {
  const next = new Set(set);
  if (on) next.add(key);
  else next.delete(key);
  return next;
}

/** Type an address; Add puts it on the list, checked. */
function AddAddress({ onAdd }: { onAdd: (email: string) => void }) {
  const [text, setText] = useState('');
  const email = text.trim().toLowerCase();
  const valid = EMAIL.test(email) && email.length <= 320;
  return (
    <div className="flex items-end gap-2">
      <TextField label="Add email" type="email" value={text} onChange={setText} className="min-w-0 flex-1" testId="ir-send-email" />
      <Button
        icon={Plus}
        disabled={!valid}
        data-testid="ir-send-add"
        onClick={() => {
          onAdd(email);
          setText('');
        }}
      >
        Add
      </Button>
    </div>
  );
}

function Picker({ row, people, onSent }: PickerProps) {
  const send = useSendResults();
  const linkRequester = row.requested_by === null && row.requester_email !== null ? row.requester_email : null;
  const [picked, setPicked] = useState(() => new Set(people.filter((p) => p.preselect).map((p) => p.member_id)));
  const [requester, setRequester] = useState(linkRequester !== null);
  const [typed, setTyped] = useState<string[]>([]);
  const [typedOn, setTypedOn] = useState<ReadonlySet<string>>(new Set());
  const count = picked.size + (requester ? 1 : 0) + typedOn.size;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-page/40 p-3" data-testid="ir-send-picker">
      {linkRequester !== null ? (
        <CheckField
          label={`${row.requester_name ?? 'Requester'} · ${linkRequester}`}
          checked={requester}
          onChange={setRequester}
          testId="ir-send-requester"
        />
      ) : null}
      {people.map((p) => (
        <CheckField
          key={p.member_id}
          label={p.company ? `${p.full_name} · ${p.company}` : p.full_name}
          checked={picked.has(p.member_id)}
          onChange={(on) => {
            setPicked(toggled(picked, p.member_id, on));
          }}
        />
      ))}
      {typed.map((email) => (
        <CheckField
          key={email}
          label={email}
          checked={typedOn.has(email)}
          testId="ir-send-typed"
          onChange={(on) => {
            setTypedOn(toggled(typedOn, email, on));
          }}
        />
      ))}
      {people.length === 0 && linkRequester === null && typed.length === 0 ? (
        <p className="py-1 text-sm text-ink-2" data-testid="ir-send-empty">
          No one on the job to send to. Add an email.
        </p>
      ) : null}
      <AddAddress
        onAdd={(email) => {
          if (!typed.includes(email)) setTyped([...typed, email]);
          setTypedOn(toggled(typedOn, email, true));
        }}
      />
      {send.isError ? <p className="text-sm text-danger">{messageOf(send.error)}</p> : null}
      <div className="flex justify-end pt-1">
        <Button
          variant="primary"
          icon={Send}
          disabled={count === 0}
          loading={send.isPending}
          data-testid="ir-send-go"
          onClick={() => {
            send.mutate({ row, memberIds: [...picked], requester, emails: [...typedOn] }, { onSuccess: onSent });
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
          data-testid="ir-send-open"
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
          {people.isError ? <ErrorState error={people.error} onRetry={() => void people.refetch()} className="m-0" /> : null}
          {people.data ? <Picker row={row} people={people.data} onSent={setResult} /> : null}
        </>
      ) : null}
      {result ? <Sent result={result} /> : null}
    </div>
  );
}
