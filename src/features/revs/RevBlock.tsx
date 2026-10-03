// One rev in Setup: its number and name (edited in place, or removed with Undo), then its items in order, each moved
// up or down, edited (name, who does it) or removed with Undo, and "Add item" at the end.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Rev, RevItem } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { ItemForm, RevForm } from './SetupForms';
import { SetupRow } from './SetupRow';
import type { useSetupActions } from './useSetupActions';

type Actions = ReturnType<typeof useSetupActions>;

interface RevBlockProps {
  rev: Rev;
  items: readonly RevItem[];
  actions: Actions;
  isPhone: boolean;
}

/** What is open for editing in this rev: the rev itself, one item, or a new item. */
type Editing = { kind: 'rev' } | { kind: 'item'; id: string } | { kind: 'add' } | null;

export function RevBlock({ rev, items, actions, isPhone }: RevBlockProps) {
  const [editing, setEditing] = useState<Editing>(null);
  const close = () => {
    setEditing(null);
  };
  const title = `Rev ${String(rev.number)} · ${rev.name}`;
  return (
    <section className="flex flex-col" data-testid={`rev-setup-rev-${String(rev.number)}`}>
      {editing?.kind === 'rev' ? (
        <RevForm rev={rev} onSave={(n, name) => actions.rev(rev, n, name)} onCancel={close} />
      ) : (
        <SetupRow
          name={title}
          strong
          isPhone={isPhone}
          disabled={actions.busy}
          onEdit={() => { setEditing({ kind: 'rev' }); }}
          onRemove={() => { actions.remove('rev', rev, `Rev ${String(rev.number)}`); }}
        >
          {title}
        </SetupRow>
      )}
      <ul className="ml-3 flex flex-col divide-y divide-line border-l-2 border-line pl-3">
        {items.map((it, i) => (
          <li key={it.id} data-testid={`rev-setup-item-${it.id}`}>
            {editing?.kind === 'item' && editing.id === it.id ? (
              <ItemForm name={it.name} company={it.company} onSave={(name, company) => actions.item(it, name, company)} onCancel={close} />
            ) : (
              <SetupRow
                name={it.name}
                isPhone={isPhone}
                disabled={actions.busy}
                onUp={i > 0 ? () => { actions.moveItem(items, it, -1); } : undefined}
                onDown={i < items.length - 1 ? () => { actions.moveItem(items, it, 1); } : undefined}
                onEdit={() => { setEditing({ kind: 'item', id: it.id }); }}
                onRemove={() => { actions.remove('item', it, it.name); }}
              >
                {it.name}
                {it.company ? <span className="ml-1.5 inline-block text-[13px] text-ink-3">{it.company}</span> : null}
              </SetupRow>
            )}
          </li>
        ))}
        <li className="py-1">
          {editing?.kind === 'add' ? (
            <ItemForm saveLabel="Add" onSave={(name, company) => actions.addItem(rev.id, name, company)} onCancel={close} />
          ) : (
            <Button size="sm" variant="quiet" icon={Plus} className="-ml-2" data-testid="rev-add-item" onClick={() => { setEditing({ kind: 'add' }); }}>
              Add item
            </Button>
          )}
        </li>
      </ul>
    </section>
  );
}
