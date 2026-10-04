// The inspection requests for this permit: number (with its OFS IR number on an OFS request), type, day and what is
// inspected on one line with its status chip; a tap opens it in the job's Inspections. The official (or an inspector)
// links one of the job's requests, or takes one off, with Undo.
import { useNavigate } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useLinkInspection } from '../../data/permits.mutations';
import type { PermitDetail } from '../../data/permits.types';
import { formatDay } from '../../lib/dates';
import { ofsIrLabel } from '../../lib/markup';
import { STATUS, type StatusKey } from '../../lib/status';
import { Button } from '../../ui/Button';
import { SelectField } from '../../ui/Fields';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { typeLabel } from '../inspections/model';

interface PermitInspectionsProps {
  detail: PermitDetail;
}

function chipKey(key: string | undefined): StatusKey {
  return key !== undefined && key in STATUS ? (key as StatusKey) : 'pending';
}

function line(r: { number: number; ofs_number: number | null; kind: string; special_kind: string | null; request_date: string }): string {
  const ir = r.ofs_number === null ? `IR ${String(r.number)}` : `IR ${String(r.number)} · ${ofsIrLabel(r.ofs_number)}`;
  return `${ir} · ${typeLabel(r.kind, r.special_kind)} · ${formatDay(r.request_date, 'MMM d')}`;
}

export function PermitInspections({ detail }: PermitInspectionsProps) {
  const navigate = useNavigate();
  const link = useLinkInspection();
  const toast = useToast();
  const p = detail.permit;
  if (detail.inspections.length === 0 && !(detail.can.link && detail.linkable.length > 0)) return null;
  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };

  function setLink(requestId: string, version: number, permitId: string | null) {
    link.mutate(
      { projectId: p.project_id, requestId, version, permitId },
      {
        onSuccess: () => {
          toast.show({
            message: permitId === null ? 'Inspection taken off.' : 'Inspection linked.',
            // The request's version moved by one with the link.
            action: { label: 'Undo', onClick: () => { link.mutate({ projectId: p.project_id, requestId, version: version + 1, permitId: permitId === null ? p.id : null }, { onError: failed }); } },
          });
        },
        onError: failed,
      },
    );
  }

  return (
    <section className="flex flex-col gap-2" data-testid="permit-inspections">
      <h2 className="text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-ink-3">Inspections</h2>
      {detail.inspections.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-card">
          {detail.inspections.map((r) => (
            <li key={r.id} className="flex items-start gap-2 px-3 py-2">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                data-testid="permit-inspection"
                onClick={() => {
                  void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId: p.project_id, tool: 'inspections', itemId: r.id } });
                }}
              >
                <span className="block text-[13px] font-medium tabular-nums text-ink-2">{line(r)}</span>
                <span className="block break-words text-sm text-ink">{r.items}</span>
              </button>
              <StatusChip status={chipKey(r.status_key)} />
              {detail.can.link ? (
                <Button size="sm" variant="quiet" icon={X} aria-label={`Take IR ${String(r.number)} off this permit`} onClick={() => { setLink(r.id, r.version, null); }} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {detail.can.link && detail.linkable.length > 0 ? (
        <SelectField
          label="Link an inspection"
          value=""
          options={[{ value: '', label: 'Pick a request' }, ...detail.linkable.map((r) => ({ value: r.id, label: `${line(r)} · ${r.items}` }))]}
          testId="permit-link"
          onChange={(id) => {
            const r = detail.linkable.find((x) => x.id === id);
            if (r) setLink(r.id, r.version, p.id);
          }}
        />
      ) : null}
    </section>
  );
}
