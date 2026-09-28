// Impact (SPEC §7.4): after the answer, the originator has the job's window to claim cost or time impact. A claim is
// permanent (amber, the one amber highlight); the GC may add a note but never remove it. No claim in the window = none.
import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useClaimImpact, useGcNote } from '../../data/rfis.mutations';
import type { RfiDetail } from '../../data/rfis.types';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { CheckField } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { impactKinds, impactWindow } from './model';
import { NoteField } from './NoteForm';

interface ImpactProps {
  detail: RfiDetail;
  timeZone: string;
  now: Date;
}

function ClaimForm({ detail, onDone }: { detail: RfiDetail; onDone: () => void }) {
  const claim = useClaimImpact();
  const toast = useToast();
  const [cost, setCost] = useState(detail.rfi.cost_impact === true);
  const [time, setTime] = useState(detail.rfi.time_impact === true);
  const [note, setNote] = useState('');
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line p-3" data-testid="rfi-claim-form">
      <div className="flex gap-6">
        <CheckField label="Cost" checked={cost} onChange={setCost} testId="rfi-claim-cost" />
        <CheckField label="Time" checked={time} onChange={setTime} testId="rfi-claim-time" />
      </div>
      <NoteField label="Note" value={note} onChange={setNote} testId="rfi-claim-note" />
      {claim.isError ? <p className="text-sm text-danger">{messageOf(claim.error)}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={claim.isPending}
          disabled={!cost && !time}
          data-testid="rfi-claim-confirm"
          onClick={() => {
            claim.mutate(
              { ref: detail.rfi, cost, time, note },
              {
                onSuccess: () => {
                  toast.show({ message: 'Impact claimed' });
                  onDone();
                },
              },
            );
          }}
        >
          Claim impact
        </Button>
      </div>
    </div>
  );
}

function GcNoteForm({ detail, onDone }: { detail: RfiDetail; onDone: () => void }) {
  const save = useGcNote();
  const [note, setNote] = useState(detail.rfi.impact_gc_note ?? '');
  return (
    <div className="flex flex-col gap-2">
      <NoteField label="GC note" value={note} onChange={setNote} testId="rfi-gc-note" autoFocus />
      {save.isError ? <p className="text-sm text-danger">{messageOf(save.error)}</p> : null}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="quiet" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          loading={save.isPending}
          disabled={note.trim() === ''}
          onClick={() => {
            save.mutate({ ref: detail.rfi, note }, { onSuccess: onDone });
          }}
        >
          Save note
        </Button>
      </div>
    </div>
  );
}

function Claimed({ detail, timeZone }: Omit<ImpactProps, 'now'>) {
  const r = detail.rfi;
  const [noting, setNoting] = useState(false);
  return (
    <section className="flex flex-col gap-2 rounded-md border border-impact-edge bg-impact-row p-3" data-testid="rfi-impact-claimed">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon icon={TriangleAlert} size={16} className="text-impact-ink" />
        Impact claimed · {impactKinds(r.impact_cost, r.impact_time)}
      </p>
      <p className="text-xs text-ink-2">
        {detail.originator_name}
        {r.impact_claimed_at !== null ? ` · ${formatInZone(r.impact_claimed_at, timeZone, 'MMM d, h:mm a')}` : ''}
      </p>
      {r.impact_note ? <p className="whitespace-pre-wrap break-words text-sm text-ink">{r.impact_note}</p> : null}
      {r.impact_gc_note && !noting ? (
        <p className="whitespace-pre-wrap break-words border-t border-impact-edge pt-2 text-sm text-ink">
          <span className="font-medium">GC note: </span>
          {r.impact_gc_note}
        </p>
      ) : null}
      {detail.can.gc_note && !noting ? (
        <div>
          <Button size="sm" variant="secondary" data-testid="rfi-gc-note-open" onClick={() => { setNoting(true); }}>
            {r.impact_gc_note ? 'Edit GC note' : 'GC note'}
          </Button>
        </div>
      ) : null}
      {noting ? <GcNoteForm detail={detail} onDone={() => { setNoting(false); }} /> : null}
    </section>
  );
}

export function RfiImpact({ detail, timeZone, now }: ImpactProps) {
  const [claiming, setClaiming] = useState(false);
  const r = detail.rfi;
  if (r.impact_claimed_at !== null) return <Claimed detail={detail} timeZone={timeZone} />;
  const win = impactWindow(r.impact_until, timeZone, now);
  if (win === null || (r.status !== 'answered' && r.status !== 'closed')) return null;
  if (!win.open) return <p className="text-sm text-ink-2" data-testid="rfi-no-impact">No impact claimed</p>;
  if (claiming) return <ClaimForm detail={detail} onDone={() => { setClaiming(false); }} />;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {detail.can.claim_impact ? (
        <Button data-testid="rfi-claim" icon={TriangleAlert} onClick={() => { setClaiming(true); }}>
          Claim impact
        </Button>
      ) : (
        <span className="text-sm text-ink-2">Impact window</span>
      )}
      <span className="text-sm text-ink-2" data-testid="rfi-impact-left">
        {win.text}
      </span>
    </div>
  );
}
