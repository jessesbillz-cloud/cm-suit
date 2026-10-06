// An OFS request in the hands of whoever sends it (SPEC §18.4 P1, 0091): the inspector, or the job's OFS duty holder.
// He routes it, he never inspects it. Before it is sent: Send to OFS (the duty holder's once the inspector has checked
// it), or Postpone (the inspector's, the form every request has). Once sent it is the deputy's: one quiet line here, and
// Undo for the sender while the deputy has not acted. The database decides each one again.
import { useState } from 'react';
import { PauseCircle, Send, Undo2 } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useSendOfs, useUnsendOfs } from '../../data/inspections.decide';
import type { IrRequest } from '../../data/inspections.types';
import type { IrRevItem } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { WITH_GC, WITH_OFS, ownsSteps, withOfs } from './model';
import { canSend } from './ofsFlow';
import { PostponeForm, canPostpone } from './PostponeForm';

interface OfsRouteProps {
  row: IrRequest;
  me: string;
  /** The request's walls and items (null when it has none): a wall with a result means the deputy has acted. */
  revs: readonly IrRevItem[] | null;
  /** I decide inspections here (ir.decide); otherwise I hold the job's OFS requests duty. */
  inspector: boolean;
}

/** Not sent yet, and mine or nobody's: send it on, or postpone it. */
function OfsSend({ row, me, inspector }: { row: IrRequest; me: string; inspector: boolean }) {
  const send = useSendOfs();
  const [postponing, setPostponing] = useState(false);
  if (!ownsSteps(row, me)) return null;
  const sendable = row.status === 'pending' || row.status === 'postponed';
  const postponable = inspector && canPostpone(row.status);

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-accent/50 p-3 ring-[3px] ring-accent/10"
      aria-label="Inspector"
      data-testid="ir-ofs-route"
    >
      <div className="flex flex-wrap gap-2">
        {sendable ? (
          <Button
            variant="primary"
            icon={Send}
            loading={send.isPending}
            disabled={!canSend(row, inspector)}
            data-testid="ir-send-ofs"
            onClick={() => {
              send.mutate(row);
            }}
          >
            Send to OFS
          </Button>
        ) : null}
        {postponable ? (
          <Button
            icon={PauseCircle}
            aria-pressed={postponing}
            data-testid="ir-postpone-open"
            onClick={() => {
              setPostponing(!postponing);
            }}
          >
            Postpone
          </Button>
        ) : null}
      </div>
      {postponing && postponable ? (
        <PostponeForm
          row={row}
          onDone={() => {
            setPostponing(false);
          }}
        />
      ) : null}
      {send.isError ? <p className="text-sm text-danger">{messageOf(send.error)}</p> : null}
    </section>
  );
}

/** Sent: read only. Undo is the sender's, while the request is still pending, nobody's, and has no result anywhere. */
function OfsSent({ row, me, revs }: OfsRouteProps) {
  const unsend = useUnsendOfs();
  const toast = useToast();
  const untouched = row.status === 'pending' && row.owner_id === null && row.result === null && (revs ?? []).every((c) => c.result === null);

  return (
    <div className="flex min-h-8 flex-wrap items-center gap-3" data-testid="ir-with-ofs">
      <p className="text-sm text-ink-2">{WITH_OFS}</p>
      {row.ofs_sent_by === me && untouched ? (
        <Button
          size="sm"
          variant="quiet"
          icon={Undo2}
          loading={unsend.isPending}
          data-testid="ir-unsend-ofs"
          onClick={() => {
            unsend.mutate(row, {
              onError: (e) => {
                toast.show({ tone: 'error', message: messageOf(e) });
              },
            });
          }}
        >
          Undo
        </Button>
      ) : null}
    </div>
  );
}

export function OfsRoute({ row, me, revs, inspector }: OfsRouteProps) {
  if (WITH_GC.includes(row.status)) return null;
  return withOfs(row) ? <OfsSent row={row} me={me} revs={revs} inspector={inspector} /> : <OfsSend row={row} me={me} inspector={inspector} />;
}
