// Leveling decisions for one bid (SPEC §11.6): not comparable, duplicate, backup, move to another package, a note.
// Each one applies at once with Undo in the toast (CLAUDE.md rule 16: no "are you sure?"). The note saves on blur.
// Writes run one after another so a note blur followed by a click never sends the same version twice.
import { useEffect, useRef, useState } from 'react';
import { Copy, EyeOff, Layers } from 'lucide-react';
import { useSetLeveling } from '../../data/bids.mutations';
import type { LevelingPatch, LevelingRow, LevelingSaved, PackageRow } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { SelectField } from '../../ui/Fields';
import { SaveState } from '../../ui/SaveState';
import { useToast } from '../../ui/Toast';

interface LevelingActionsProps {
  projectId: string;
  row: LevelingRow;
  packages: readonly PackageRow[];
}

const INPUT = 'rounded-md border border-line px-2.5 py-2 text-sm font-normal text-ink outline-none focus:border-accent';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';

export function LevelingActions({ projectId, row, packages }: LevelingActionsProps) {
  const set = useSetLeveling();
  const toast = useToast();
  const [note, setNote] = useState(row.notes);
  const [noteSaved, setNoteSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const version = useRef(row.leveling_version);
  const chain = useRef<Promise<void>>(Promise.resolve());

  // A refetched board (someone else's save, or ours) moves the known version forward, never back.
  useEffect(() => {
    if ((row.leveling_version ?? 0) > (version.current ?? 0)) version.current = row.leveling_version;
  }, [row.leveling_version]);

  /** One write after the previous one, always with the latest version this pane knows. */
  function run(patch: LevelingPatch, onOk: (saved: LevelingSaved) => void, onErr: (e: unknown) => void) {
    chain.current = chain.current.then(() =>
      set
        .mutateAsync({ projectId, submissionId: row.submission_id, version: version.current, patch })
        .then((saved) => {
          version.current = saved.version;
          onOk(saved);
        }, onErr),
    );
  }

  /** Applies a patch now; the toast's Undo sends the inverse. */
  function apply(patch: LevelingPatch, inverse: LevelingPatch, message: string) {
    run(
      patch,
      () => {
        toast.show({
          message,
          action: {
            label: 'Undo',
            onClick: () => {
              run(inverse, () => undefined, (e) => {
                toast.show({ tone: 'error', message: `Not undone: ${messageOf(e)}` });
              });
            },
          },
        });
      },
      (e) => {
        toast.show({ tone: 'error', message: `Not saved: ${messageOf(e)}` });
      },
    );
  }

  function saveNote() {
    const next = note.trim();
    if (next === row.notes) return;
    run(
      { notes: next },
      () => {
        setNoteSaved(true);
        setProblem(null);
      },
      (e) => {
        setProblem(messageOf(e));
      },
    );
  }

  const sorted = [...packages].sort((a, b) => a.code.localeCompare(b.code));
  const current = row.package_id;

  return (
    <div className="flex flex-col gap-3" data-testid="leveling-actions">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          icon={EyeOff}
          aria-pressed={!row.comparable}
          onClick={() => {
            apply({ comparable: !row.comparable }, { comparable: row.comparable }, row.comparable ? 'Set aside as not comparable.' : 'Comparable again.');
          }}
        >
          {row.comparable ? 'Not comparable' : 'Comparable'}
        </Button>
        <Button
          size="sm"
          icon={Copy}
          aria-pressed={row.is_duplicate}
          onClick={() => {
            apply({ is_duplicate: !row.is_duplicate }, { is_duplicate: row.is_duplicate }, row.is_duplicate ? 'Not a duplicate.' : 'Marked duplicate.');
          }}
        >
          {row.is_duplicate ? 'Not a duplicate' : 'Duplicate'}
        </Button>
        <Button
          size="sm"
          icon={Layers}
          aria-pressed={row.is_backup}
          onClick={() => {
            apply({ is_backup: !row.is_backup }, { is_backup: row.is_backup }, row.is_backup ? 'Not a backup.' : 'Marked backup.');
          }}
        >
          {row.is_backup ? 'Not a backup' : 'Backup'}
        </Button>
      </div>
      <SelectField
        label="Package"
        value={current}
        options={sorted.map((p) => ({ value: p.id, label: `${p.code} ${p.name}` }))}
        testId="leveling-move"
        onChange={(v) => {
          if (v === current) return;
          const target = sorted.find((p) => p.id === v);
          apply(
            { reassigned_package_id: v === row.original_package_id ? null : v },
            { reassigned_package_id: current === row.original_package_id ? null : current },
            `Moved to ${target?.code ?? 'package'}.`,
          );
        }}
      />
      <label className={LABEL}>
        Note
        <textarea rows={2} className={INPUT} value={note} onBlur={saveNote} onChange={(e) => {
            setNote(e.target.value);
            setNoteSaved(false);
          }}
        />
      </label>
      <SaveState pending={set.isPending} saved={noteSaved} problem={problem} />
    </div>
  );
}
