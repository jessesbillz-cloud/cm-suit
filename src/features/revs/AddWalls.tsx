// Walls for a list (revs.manage): the level (the list's levels offered), the walls pasted one per line, and the plan
// sheet they are on, picked from the job's PDFs. A wall already on that level is kept as it is. The toast's Undo
// takes the new walls off again.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useAddRevAreas, useRemoveRev } from '../../data/revs.mutations';
import { useRevSetup } from '../../data/revs.queries';
import { Button } from '../../ui/Button';
import { FIELD_AREA, FIELD_LABEL, SelectField } from '../../ui/Fields';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { levelsOf } from './model';
import { LevelField } from './SetupForms';
import { SheetPicker } from './SheetPicker';
import { useRevsNav } from './useRevsNav';

const MAX_WALLS = 200;
const NAME_MAX = 160;

/** The pasted names: one per line, each once. */
function wallNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line.replace(/\s+/g, ' ').trim();
    if (name === '' || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

export function AddWalls({ projectId }: { projectId: string }) {
  const setup = useRevSetup(projectId);
  const add = useAddRevAreas();
  const remove = useRemoveRev();
  const nav = useRevsNav(projectId, true);
  const toast = useToast();
  const [listId, setListId] = useState<string | null>(null);
  const [level, setLevel] = useState('');
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState<string | null>(null);

  if (setup.isError) return <ErrorState error={setup.error} onRetry={() => void setup.refetch()} />;
  if (!setup.data) return <LoadingState />;
  const lists = setup.data.lists;
  // Prefill: the newest list (the one just pasted in).
  const list = lists.find((l) => l.id === listId) ?? lists[lists.length - 1];
  if (!list) return <EmptyState title="Make a list first." />;
  const names = wallNames(text);
  const tooLong = names.find((n) => n.length > NAME_MAX);
  const problem = names.length > MAX_WALLS ? `Up to ${String(MAX_WALLS)} walls at a time.` : tooLong ? `Keep wall names to ${String(NAME_MAX)} characters.` : null;
  const ready = level.trim() !== '' && names.length > 0 && problem === null;
  const before = new Set(setup.data.areas.map((a) => a.id));

  function submit() {
    if (!list) return;
    add.mutate(
      { projectId, listId: list.id, level, names, sheetFileId: sheet },
      {
        onSuccess: (rows) => {
          const added = rows.filter((r) => !before.has(r.id));
          toast.show({
            message: added.length === 0 ? 'Those walls are already there.' : `${String(added.length)} ${added.length === 1 ? 'wall' : 'walls'} added.`,
            action:
              added.length === 0
                ? undefined
                : {
                    label: 'Undo',
                    onClick: () => {
                      void Promise.all(added.map((r) => remove.mutateAsync({ projectId, kind: 'area', id: r.id, version: r.version }))).catch(
                        (e: unknown) => {
                          toast.show({ tone: 'error', message: messageOf(e) });
                        },
                      );
                    },
                  },
          });
          nav.close();
        },
      },
    );
  }

  return (
    <form
      className="flex min-h-full flex-col"
      data-testid="rev-walls-new"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) submit();
      }}
    >
      <div className="flex flex-1 flex-col gap-4 px-5 py-4">
        <h1 className="text-[17px] font-semibold leading-6 tracking-[-0.01em] text-ink">Add walls</h1>
        {lists.length > 1 ? (
          <SelectField label="List" value={list.id} options={lists.map((l) => ({ value: l.id, label: l.name }))} onChange={setListId} testId="rev-walls-list" />
        ) : null}
        <LevelField value={level} levels={levelsOf(setup.data, list.id).map((g) => g.level)} onChange={setLevel} autoFocus />
        <label className={FIELD_LABEL}>
          Walls
          <textarea
            rows={6}
            maxLength={40000}
            className={FIELD_AREA}
            placeholder={'One per line\nShaftwall at Stair 2 (C-D / 3-4)'}
            value={text}
            data-testid="rev-walls-names"
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
        </label>
        {problem ? (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        ) : null}
        <SheetPicker projectId={projectId} value={sheet} onChange={setSheet} />
        {add.isError ? (
          <p role="alert" className="text-sm text-danger">
            {messageOf(add.error)}
          </p>
        ) : null}
      </div>
      <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-card px-5 py-3">
        <Button type="submit" variant="primary" icon={Plus} loading={add.isPending} disabled={!ready} data-testid="rev-walls-add">
          {names.length > 1 ? `Add ${String(names.length)} walls` : 'Add wall'}
        </Button>
      </footer>
    </form>
  );
}
