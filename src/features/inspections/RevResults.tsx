// The deputy's result on an OFS request with walls: Pass or Fail on each wall of each item; a failed one says why
// (OSFM: not just a red circle). Once every wall is set it saves by itself (ir_rev_results), and the request's result
// follows: approved when all passed. "All passed" is one tap; it and Clear come with Undo, never a question.
import { useState } from 'react';
import { CheckCheck, Eraser } from 'lucide-react';
import { messageOf } from '../../data/errors';
import type { IrRef } from '../../data/inspections.mutations';
import type { IrRequest } from '../../data/inspections.types';
import { useSetRevResults } from '../../data/revs.mutations';
import type { IrRevItem, RevResult, RevSetup } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { FIELD_AREA } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';
import { ChoiceRow } from './ChoiceRow';
import { CellGroupCard, LevelLine, WithSetup } from './RevCells';
import {
  allPassed, cellGroups, cellKey, draftOf, draftToSave, leftToDo, savedResults, settle, type CellDraft, type CellResult,
  type Edits,
} from './revCells';

const PASS_FAIL = [
  { value: 'passed', label: 'Pass' },
  { value: 'failed', label: 'Fail' },
] as const;

const NOTE_MISSING = FIELD_AREA.replace('border-line-strong', 'border-danger');

interface BodyProps {
  row: IrRequest;
  cells: readonly IrRevItem[];
  setup: RevSetup;
}

function RevResultsBody({ row, cells, setup }: BodyProps) {
  const set = useSetRevResults();
  const toast = useToast();
  const [edits, setEdits] = useState<Edits>({});
  const saved = savedResults(cells);
  const left = leftToDo(cells, edits);
  const everyPassed = saved !== null && saved.every((r) => r.result === 'passed');

  function save(ref: IrRef, results: RevResult[] | null, undo?: { message: string; back: RevResult[] | null }) {
    set.mutate(
      { row: ref, results },
      {
        onSuccess: (next) => {
          setEdits((cur) => settle(cur, results));
          if (!undo) return;
          toast.show({
            message: undo.message,
            action: {
              label: 'Undo',
              onClick: () => {
                save({ id: next.id, version: next.version, project_id: next.project_id }, undo.back);
              },
            },
          });
        },
        onError: (e) => {
          toast.show({ tone: 'error', message: `Result not saved: ${messageOf(e)}` });
        },
      },
    );
  }

  /** A change; saved once every wall is set (a reason is saved when its box is left). */
  function edit(cell: IrRevItem, next: CellDraft, now: boolean) {
    const all = { ...edits, [cellKey(cell)]: next };
    setEdits(all);
    const results = now && !set.isPending ? draftToSave(cells, all) : null;
    if (results !== null) save(row, results);
  }

  return (
    <div className="flex flex-col gap-2.5" data-testid="rev-results">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={CheckCheck}
          disabled={set.isPending || everyPassed}
          data-testid="rev-all-passed"
          onClick={() => {
            save(row, allPassed(cells), { message: 'All passed.', back: saved });
          }}
        >
          All passed
        </Button>
        {saved !== null ? (
          <Button
            size="sm"
            variant="quiet"
            icon={Eraser}
            disabled={set.isPending}
            onClick={() => {
              save(row, null, { message: 'Results cleared.', back: saved });
            }}
          >
            Clear
          </Button>
        ) : null}
        <span className="ml-auto text-xs tabular-nums text-ink-2" data-testid="rev-left" aria-live="polite">
          {set.isPending ? 'Saving' : left > 0 ? `${String(left)} left` : ''}
        </span>
      </div>
      <LevelLine cells={cells} setup={setup} />
      {cellGroups(cells, setup).map((g) => (
        <CellGroupCard key={g.color} group={g}>
          {g.rows.map(({ cell, label }) => {
            const draft = draftOf(cell, edits);
            const id = `${cell.area_id}-${cell.item_id}`;
            return (
              <li key={cell.id} className="flex flex-col gap-2 px-3 py-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="break-words text-sm text-ink">{label}</span>
                  <ChoiceRow<CellResult>
                    label={`${label}: result`}
                    options={PASS_FAIL}
                    value={draft.result}
                    disabled={set.isPending}
                    responsive
                    testId={`rev-cell-${id}`}
                    onPick={(v) => {
                      edit(cell, { ...draft, result: v === draft.result ? null : v }, true);
                    }}
                  />
                </div>
                {draft.result === 'failed' ? (
                  <textarea
                    rows={2}
                    aria-label="Why it failed"
                    placeholder="Why it failed"
                    maxLength={1000}
                    className={draft.note.trim() === '' ? NOTE_MISSING : FIELD_AREA}
                    value={draft.note}
                    data-testid={`rev-note-${id}`}
                    onChange={(e) => {
                      edit(cell, { ...draft, note: e.target.value }, false);
                    }}
                    onBlur={() => {
                      edit(cell, draft, true);
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </CellGroupCard>
      ))}
    </div>
  );
}

export function RevResults({ row, cells }: { row: IrRequest; cells: readonly IrRevItem[] }) {
  return <WithSetup projectId={row.project_id}>{(setup) => <RevResultsBody row={row} cells={cells} setup={setup} />}</WithSetup>;
}
