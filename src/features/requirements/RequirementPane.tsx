// One requirement beside the list (the phone's full screen): its kind, the whole title, when it is due (red when late),
// the status (one tap for whoever manages them), who, where in the book, the trigger in words, the details, the
// sentence it came from, and the evidence (written by the managers, or by the line's own company on its own line). A
// draft shows Keep / Drop instead of the status. Edit swaps in the form; Remove has Undo.
import { useState, type ReactNode } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useKeepRequirement, useRemoveRequirement } from '../../data/requirements.mutations';
import { useRequirements } from '../../data/requirements.queries';
import type { Requirement } from '../../data/requirements.types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { TOOL_META } from '../../ui/tools';
import { Quote } from './DraftsView';
import { EvidenceField, EvidenceView } from './EvidenceField';
import { DueText, KindChip, RequiredNote, StatusOf, StatusPick } from './RequirementBits';
import { RequirementForm } from './RequirementForm';
import { triggerWords } from './model';
import { useStatusTap } from './useStatusTap';

interface PaneProps {
  projectId: string;
  id: string;
  canManage: boolean;
  onClose: () => void;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-ink-2">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

function DraftActions({ projectId, row, onClose }: { projectId: string; row: Requirement; onClose: () => void }) {
  const keep = useKeepRequirement(projectId);
  const remove = useRemoveRequirement(projectId);
  const toast = useToast();
  const fail = (e: unknown) => {
    toast.show({ message: messageOf(e), tone: 'error' });
  };
  return (
    <div className="flex gap-2">
      <Button
        variant="primary"
        icon={Check}
        className="min-w-28 max-sm:h-11 max-sm:flex-1"
        loading={keep.isPending}
        data-testid="req-pane-keep"
        onClick={() => { keep.mutate({ id: row.id, version: row.version, keep: true }, { onError: fail }); }}
      >
        Keep
      </Button>
      <Button
        icon={X}
        className="min-w-28 max-sm:h-11 max-sm:flex-1"
        data-testid="req-pane-drop"
        onClick={() => {
          remove.mutate(
            { id: row.id, removed: true },
            {
              onSuccess: () => {
                onClose();
                toast.show({ message: `Dropped: ${row.title}`, action: { label: 'Undo', onClick: () => { remove.mutate({ id: row.id, removed: false }, { onError: fail }); } } });
              },
              onError: fail,
            },
          );
        }}
      >
        Drop
      </Button>
    </div>
  );
}

function Details({ projectId, row, canManage, onEdit, onClose }: { projectId: string; row: Requirement; canManage: boolean; onEdit: () => void; onClose: () => void }) {
  const status = useStatusTap(projectId);
  const remove = useRemoveRequirement(projectId);
  const toast = useToast();
  const trigger = triggerWords(row);
  const where = [row.spec_section, row.spec_title, row.spec_ref === '' ? '' : `¶${row.spec_ref}`].filter((s) => s !== '').join(' ');
  return (
    <div className="flex flex-col gap-3 p-4" data-testid="req-pane">
        <div className="flex items-center gap-2">
          <KindChip row={row} />
          <RequiredNote row={row} />
          <span className="ml-auto text-sm">
            <DueText row={row} testId="req-pane-due" />
          </span>
          {canManage ? <Button size="sm" variant="quiet" icon={Pencil} aria-label="Edit" data-testid="req-edit" onClick={onEdit} /> : null}
        </div>
        <h2 className="whitespace-normal break-words text-lg font-semibold leading-7 text-ink" data-testid="req-pane-title">
          {row.title}
        </h2>
        {row.draft ? (
          canManage ? <DraftActions projectId={projectId} row={row} onClose={onClose} /> : null
        ) : canManage ? (
          <StatusPick status={row.status} testId="req-pane-status" onPick={(s) => { status.tap(row, s); }} />
        ) : (
          <span>
            <StatusOf status={row.status} />
          </span>
        )}
        <dl className="divide-y divide-line border-y border-line">
          {row.responsible !== '' ? <Fact label="Who">{row.responsible}</Fact> : null}
          {where !== '' ? <Fact label="Section">{where}</Fact> : null}
          {trigger !== null ? <Fact label="When">{trigger}</Fact> : null}
          {row.activity_code !== '' ? <Fact label="Activity ID">{row.activity_code}</Fact> : null}
          {row.details !== '' ? <Fact label="Details"><span className="whitespace-pre-wrap">{row.details}</span></Fact> : null}
        </dl>
        <Quote row={row} />
        {row.draft ? null : (
          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-medium text-ink-2">Evidence</h3>
            {canManage || row.mine ? <EvidenceField key={row.id} projectId={projectId} row={row} own={!canManage} /> : <EvidenceView row={row} />}
          </section>
        )}
        {canManage && !row.draft ? (
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            className="self-start"
            data-testid="req-remove"
            onClick={() => {
              remove.mutate(
                { id: row.id, removed: true },
                {
                  onSuccess: () => {
                    onClose();
                    toast.show({ message: `Removed: ${row.title}`, action: { label: 'Undo', onClick: () => { remove.mutate({ id: row.id, removed: false }); } } });
                  },
                  onError: (e) => { toast.show({ message: messageOf(e), tone: 'error' }); },
                },
              );
            }}
          >
            Remove
          </Button>
      ) : null}
    </div>
  );
}

export function RequirementPane({ projectId, id, canManage, onClose }: PaneProps) {
  const list = useRequirements(projectId);
  const [editing, setEditing] = useState(false);
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (list.isPending) return <LoadingState label="Loading" />;
  const row = list.data.find((r) => r.id === id);
  if (!row) {
    return (
      <Card>
        <EmptyState icon={TOOL_META.requirements.icon} title="That requirement is gone." />
      </Card>
    );
  }
  if (editing && canManage) {
    return (
      <div className="p-4">
        <RequirementForm projectId={projectId} row={row} onSaved={() => { setEditing(false); }} onCancel={() => { setEditing(false); }} />
      </div>
    );
  }
  return <Details projectId={projectId} row={row} canManage={canManage} onEdit={() => { setEditing(true); }} onClose={onClose} />;
}
