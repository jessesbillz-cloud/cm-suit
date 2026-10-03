// One list in Setup: its name, phase and permit (edited in place, or the list removed with Undo), its revs with their
// items, and its walls by level.
import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { RevList, RevSetup } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { RevBlock } from './RevBlock';
import { ListForm, PermitNumber } from './SetupForms';
import type { useSetupActions } from './useSetupActions';
import { WallsSetup } from './WallsSetup';

type Actions = ReturnType<typeof useSetupActions>;

interface ListCardProps {
  projectId: string;
  list: RevList;
  setup: RevSetup;
  actions: Actions;
  isPhone: boolean;
}

function SectionHead({ children }: { children: string }) {
  return <h3 className="pb-1 text-[11.5px] font-semibold uppercase leading-5 tracking-[0.06em] text-ink-3">{children}</h3>;
}

export function ListCard({ projectId, list, setup, actions, isPhone }: ListCardProps) {
  const [editing, setEditing] = useState(false);
  const revs = setup.revs.filter((r) => r.list_id === list.id);
  const size = isPhone ? 'md' : 'sm';
  return (
    <Card
      padded={false}
      title={
        <span className="flex flex-wrap items-baseline gap-x-2" data-testid={`rev-setup-list-${list.id}`}>
          <span className="break-words">{list.name}</span>
          <span className="flex gap-2 text-[13px] font-medium text-ink-3">
            {list.phase ? <span>{list.phase}</span> : null}
            {list.permit_id ? <PermitNumber projectId={projectId} permitId={list.permit_id} /> : null}
          </span>
        </span>
      }
      actions={
        <>
          <Button size={size} variant="quiet" icon={Pencil} aria-label={`Edit ${list.name}`} title="Edit" disabled={actions.busy} onClick={() => { setEditing(true); }} />
          <Button
            size={size}
            variant="quiet"
            icon={Trash2}
            aria-label={`Remove ${list.name}`}
            title="Remove"
            disabled={actions.busy}
            onClick={() => { actions.remove('list', list, list.name); }}
          />
        </>
      }
    >
      <div className="flex flex-col gap-4 px-4 py-3">
        {editing ? <ListForm list={list} onSave={(v) => actions.list(list, v)} onCancel={() => { setEditing(false); }} /> : null}
        <div className="flex flex-col gap-2">
          <SectionHead>Revs</SectionHead>
          {revs.map((r) => (
            <RevBlock key={r.id} rev={r} items={setup.items.filter((i) => i.rev_id === r.id)} actions={actions} isPhone={isPhone} />
          ))}
        </div>
        <div className="flex flex-col">
          <SectionHead>Walls</SectionHead>
          <WallsSetup projectId={projectId} setup={setup} listId={list.id} actions={actions} isPhone={isPhone} />
        </div>
      </div>
    </Card>
  );
}
