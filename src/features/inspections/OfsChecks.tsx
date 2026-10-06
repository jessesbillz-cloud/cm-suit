// An OFS request's chain (0091), what everyone who reads it sees, the fire marshal included: the sub's attestation, then
// the checks in order, each one tap for whoever does it (GC Ready, inspector Ready, SI report when a special inspection
// is required) and Undo for them while the next step has not happened, then the send. Who sends OFS requests on this
// job shows under it. The database decides each tap again.
import { Square, SquareCheck, Undo2 } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useOfsChain, useOfsCheck, type OfsCheck, type OfsStep } from '../../data/inspections.ofs';
import type { IrRequest } from '../../data/inspections.types';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { PaneSection } from '../../ui/ReadingPane';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { ofsCheckRights } from './ofsFlow';
import { OfsNumberField } from './OfsNumberField';
import type { IrCan } from './useIrAccess';

interface OfsChecksProps {
  row: IrRequest;
  can: IrCan;
  me: string;
  tz: string;
  /** I send this job's OFS requests (the duty holder, or the inspector). */
  sender: boolean;
  /** "OFS requests: <name>": who holds the duty (null while nobody does). */
  holderName: string | null;
}

interface LineProps {
  label: string;
  step: OfsStep | null;
  tz: string;
  testId: string;
  /** Tap to check (null: not mine to check now). */
  onCheck: (() => void) | null;
  /** Undo (null: not mine to undo now). */
  onUndo: (() => void) | null;
  busy: boolean;
  detail?: string | undefined;
}

function Line({ label, step, tz, testId, onCheck, onUndo, busy, detail }: LineProps) {
  const done = step !== null;
  const head = (
    <>
      <Icon icon={done ? SquareCheck : Square} size={18} className={done ? 'shrink-0 text-accent' : 'shrink-0 text-ink-2'} />
      <span className="font-semibold text-ink">{label}</span>
    </>
  );
  return (
    <li className="flex flex-col gap-0.5 py-1.5" data-testid={testId} data-done={done}>
      <div className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1">
        {!done && onCheck ? (
          <button
            type="button"
            disabled={busy}
            className="-mx-1 flex items-center gap-2 rounded-md px-1 py-1 hover:bg-page disabled:opacity-60"
            data-testid={`${testId}-check`}
            onClick={onCheck}
          >
            {head}
          </button>
        ) : (
          <span className="flex items-center gap-2">{head}</span>
        )}
        {step ? (
          <span className="text-sm text-ink-2">
            {step.name ?? ''} · {formatInZone(step.at, tz, 'MMM d, h:mm a')}
          </span>
        ) : null}
        {done && onUndo ? (
          <Button size="sm" variant="quiet" icon={Undo2} loading={busy} onClick={onUndo} data-testid={`${testId}-undo`}>
            Undo
          </Button>
        ) : null}
      </div>
      {detail ? <p className="whitespace-pre-wrap break-words pl-7 text-sm text-ink-2">{detail}</p> : null}
    </li>
  );
}

export function OfsChecks({ row, can, me, tz, sender, holderName }: OfsChecksProps) {
  const chain = useOfsChain(row.project_id, row.id);
  const check = useOfsCheck();
  const toast = useToast();
  if (chain.isError) return <ErrorState error={chain.error} onRetry={() => void chain.refetch()} className="m-0" />;
  if (chain.isPending) return <LoadingState label="Loading the checks" />;
  const c = chain.data;
  if (c === null) return null;
  const rights = ofsCheckRights(row, can, me);
  const busy = check.isPending;
  const tap = (which: OfsCheck, on: boolean) => () => {
    check.mutate(
      { row, check: which, on },
      {
        onError: (e) => {
          toast.show({ tone: 'error', message: messageOf(e) });
        },
      },
    );
  };

  return (
    <PaneSection title="OFS" testId="ofs-checks">
      {sender && row.signed_at === null && row.status !== 'withdrawn' ? <OfsNumberField key={`${row.id}:${String(row.ofs_number)}`} row={row} /> : null}
      <ul className="flex flex-col divide-y divide-line">
        {c.attest ? (
          <Line label="Attested" step={c.attest} tz={tz} testId="ofs-attest" onCheck={null} onUndo={null} busy={false} detail={c.attest.text} />
        ) : null}
        <Line label="GC ready" step={c.gc} tz={tz} testId="ofs-gc" busy={busy}
          onCheck={rights.gc ? tap('gc', true) : null} onUndo={rights.gcUndo ? tap('gc', false) : null} />
        <Line label="Inspector ready" step={c.ready} tz={tz} testId="ofs-ready" busy={busy}
          onCheck={rights.ready ? tap('ready', true) : null} onUndo={rights.readyUndo ? tap('ready', false) : null} />
        {c.special_required ? (
          <Line label="SI report" step={c.si} tz={tz} testId="ofs-si" busy={busy}
            onCheck={rights.si ? tap('si', true) : null} onUndo={rights.siUndo ? tap('si', false) : null} />
        ) : null}
        {c.sent ? <Line label="Sent to OFS" step={c.sent} tz={tz} testId="ofs-sent" onCheck={null} onUndo={null} busy={false} /> : null}
      </ul>
      {holderName !== null ? (
        <p className="text-sm text-ink-2" data-testid="ofs-duty">
          OFS requests: <span className="font-semibold text-ink">{holderName}</span>
        </p>
      ) : null}
    </PaneSection>
  );
}
